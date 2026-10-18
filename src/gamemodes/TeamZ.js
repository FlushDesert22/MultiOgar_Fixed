// TODO: make this gamemode extend the Tournament class
var Mode = require('./Mode.js');
var Entity = require('../entity');
var Virus = require('../entity/Virus.js');
const PlayerCell = require('../entity/PlayerCell.js');

var GameServer = null; // represent GameServer Type
var GS_getRandomColor = null; // backup getRandomColor function of GameServer type
var GS_getNearestVirus = null;
var GS_checkRigidCollision = null;
var GS_resolveRigidCollision = null;
var GS_resolveCollision = null;
var GS_splitPlayerCell = null;
var Virus_onEaten = Virus.prototype.onEaten;

var GameState = {
    WF_PLAYERS: 0,
    WF_START: 1,
    IN_PROGRESS: 2
};

// new Cell Type IDs of HERO and BRAIN are calculated based on Game Mode ID
var CellType = {
    PLAYER: 0,
    FOOD: 1,
    VIRUS: 2,
    EJECTED_MASS: 3,
    HERO: 130,
    BRAIN: 131
};

var localLB = [];

function TeamZ() {
    Mode.apply(this, Array.prototype.slice.call(arguments));
    
    this.ID = 13;
    this.name = 'Zombie Team';
    this.packetLB = 48;
    this.haveTeams = true;
    
    // configurations:
    this.minPlayer = 2; // game is auto started if there are at least 2 players
    this.gameDuration = 18000; // ticks, 1 tick = 50 ms (20 ticks = 1 s)
    this.warmUpDuration = 600; // ticks, time to wait between games
    this.crazyDuration = 200; // ticks
    this.heroEffectDuration = 1000; // ticks
    this.brainEffectDuration = 200; // ticks
    this.spawnBrainInterval = 1200; // ticks
    this.spawnHeroInterval = 600; // ticks
    this.defaultColor = {
        r: 0x9b,
        g: 0x30,
        b: 0xff
    };
    
    this.colorFactorStep = 5;
    this.colorLower = 50; // Min 0
    this.colorUpper = 225; // Max 255
    this.maxBrain = -1; // set this param to any negative number to keep the number of brains not exceed number of humans
    this.maxHero = 4; // set this param to any negative number to keep the number of heros not exceed number of zombies
    
    // game mode data:
    this.state = GameState.WF_PLAYERS;
    this.winTeam = -1;
    this.gameTimer = 0;
    this.zombies = []; // the clients of zombie players
    this.humans = []; // the clients of human players
    
    this.spawnHeroTimer = 0;
    this.spawnBrainTimer = 0;
}

module.exports = TeamZ;
TeamZ.prototype = new Mode();

// Gamemode Specific Functions

TeamZ.prototype.createZColorFactor = function (client) {
    client.zColorFactor = (Math.random() * (this.colorUpper - this.colorLower + 1)) >> 0 + this.colorLower;
    client.zColorIncr = true; // color will be increased if TRUE - otherwise it will be decreased.
};

TeamZ.prototype.nextZColorFactor = function (client) {
    if (client.zColorIncr == true) {
        if (client.zColorFactor + this.colorFactorStep >= this.colorUpper) {
            client.zColorFactor = this.colorUpper;
            client.zColorIncr = false;
        } else {
            client.zColorFactor += this.colorFactorStep;
        }
    } else {
        if (client.zColorFactor - this.colorFactorStep <= this.colorLower) {
            client.zColorFactor = this.colorLower;
            client.zColorIncr = true;
        } else {
            client.zColorFactor -= this.colorFactorStep;
        }
    }
};

TeamZ.prototype.updateZColor = function (client, mask) {
    var color = {
        r: (mask & 0x4) > 0 ? client.zColorFactor : 7,
        g: (mask & 0x2) > 0 ? client.zColorFactor : 7,
        b: (mask & 0x1) > 0 ? client.zColorFactor : 7
    };
    client.setColor(color);
    for (var i = 0; i < client.cells.length; i++) {
        var cell = client.cells[i];
        cell.setColor(color);
    }
};

TeamZ.prototype.isCrazy = function (client) {
    return ((typeof (client.crazyTimer) != 'undefined') && client.crazyTimer > 0 && client.team > 0);
};

TeamZ.prototype.hasEatenHero = function (client) {
    return ((typeof (client.eatenHeroTimer) != 'undefined') && client.eatenHeroTimer > 0);
};

TeamZ.prototype.hasEatenBrain = function (client) {
    return ((typeof (client.eatenBrainTimer) != 'undefined') && client.eatenBrainTimer > 0);
};

// Call to change a human client to a zombie
TeamZ.prototype.turnToZombie = function (client) {
    // remove from human list
    var index = this.humans.indexOf(client);
    if (index >= 0) {
        this.humans.splice(index, 1);
    }
    client.team = 0; // team Z
    this.createZColorFactor(client);
    this.updateZColor(client, 0x7); // Gray
    // add to zombie list
    this.zombies.push(client);
};

TeamZ.prototype.boostSpeedCell = function (cell) {
    if (typeof cell.originalSpeed == 'undefined' || cell.originalSpeed == null) {
        cell.originalSpeed = cell.getSpeed;
        cell.getSpeed = function () {
            return 2 * this.originalSpeed();
        };
    }
};

TeamZ.prototype.boostSpeed = function (client) {
    for (var i = 0; i < client.cells.length; i++) {
        var cell = client.cells[i];
        if (typeof cell == 'undefined')
            continue;
        this.boostSpeedCell(cell);
    }
};

TeamZ.prototype.resetSpeedCell = function (cell) {
    if (typeof cell.originalSpeed != 'undefined' && cell.originalSpeed != null) {
        cell.getSpeed = cell.originalSpeed;
        cell.originalSpeed = null;
    }
};

TeamZ.prototype.resetSpeed = function (client) {
    for (var i = 0; i < client.cells.length; i++) {
        var cell = client.cells[i];
        if (typeof cell == 'undefined')
            continue;
        this.resetSpeedCell(cell);
    }
};

TeamZ.prototype.startGame = function (gameServer) {
    for (var i = 0; i < this.humans.length; i++) {
        var client = this.humans[i];
        client.team = client.pID;
        client.crazyTimer = 0;
        client.eatenHeroTimer = 0;
        client.eatenBrainTimer = 0;
        client.setColor(gameServer.getRandomColor());
        for (var j = 0; j < client.cells.length; j++) {
            var cell = client.cells[j];
            if (cell) {
                cell.setColor(client.getColor());
                cell.setSize(gameServer.config.playerMinSize);
                this.resetSpeedCell(cell);
            }
        }
    }
    
    // Select random human to be the zombie
    var zombie = this.humans[(Math.random() * this.humans.length) >> 0];
    this.turnToZombie(zombie);
    
    this.winTeam = -1;
    this.state = GameState.IN_PROGRESS;
    this.gameTimer = this.gameDuration;
};

TeamZ.prototype.endGame = function (gameServer) {
    // reset game
    for (var i = 0; i < this.zombies.length; i++) {
        var client = this.zombies[i];
        var index = this.humans.indexOf(client);
        if (index < 0) {
            this.humans.push(client);
        }
    }
    this.zombies = [];
    this.spawnHeroTimer = 0;
    this.spawnBrainTimer = 0;
    localLB = []; // reset leader board
    
    for (var i = 0; i < this.humans.length; i++) {
        var client = this.humans[i];
        client.setColor(this.defaultColor);
        client.team = 1;
        for (var j = 0; j < client.cells.length; j++) {
            var cell = client.cells[j];
            cell.setColor(this.defaultColor);
        }
    }
    
    this.state = GameState.WF_PLAYERS;
    this.gameTimer = 0;
};

TeamZ.prototype.leaderboardAddSort = function (player, leaderboard) {
    // Adds the player and sorts the leaderboard
    var len = leaderboard.length - 1;
    var loop = true;
    
    while ((len >= 0) && (loop)) {
        // Start from the bottom of the leaderboard
        if (player.getScore() <= leaderboard[len].getScore()) {
            leaderboard.splice(len + 1, 0, player);
            loop = false; // End the loop if a spot is found
        }
        len--;
    }
    if (loop) {
        // Add to top of the list because no spots were found
        leaderboard.splice(0, 0, player);
    }
};

// Override

TeamZ.prototype.onServerInit = function (gameServer) {
    // Called when the server starts
    gameServer.run = true;
    
    // Overwrite some server functions:
    GameServer = require('../GameServer.js');
    GS_getRandomColor = GameServer.prototype.getRandomColor; // backup
    GS_getNearestVirus = GameServer.prototype.getNearestVirus;
    GS_checkRigidCollision = GameServer.prototype.checkRigidCollision;
    GS_resolveRigidCollision = GameServer.prototype.resolveRigidCollision;
    GS_resolveCollision = GameServer.prototype.resolveCollision;
    GS_splitPlayerCell = GameServer.prototype.splitPlayerCell;
    
    //OVERWRITE GLOBAL FUNCTIONs to adapt Zombie Team mode
    
    GameServer.prototype.getRandomColor = function () {
        var colorRGB = [0xFF, 0x07, (Math.random() * 256) >> 0];
        colorRGB.sort(function () {
            return 0.5 - Math.random();
        });
        return {
            r: colorRGB[0],
            b: colorRGB[1],
            g: colorRGB[2]
        };
    };
    GameServer.prototype.getNearestVirus = function (cell) {
        // loop through all heros
        for (var i = 0; i < this.nodesHero.length; i++) {
            var check = this.nodesHero[i];
            if (check === null) continue;
            if (this.checkCellCollision(cell, check) != null) {
                return check;
            }
        }
        // loop through all brains
        for (var i = 0; i < this.nodesBrain.length; i++) {
            var check = this.nodesBrain[i];
            if (check === null) continue;
            if (this.checkCellCollision(cell, check) != null) {
                return check;
            }
        }
        // Loop through all viruses on the map. There is probably a more efficient way of doing this but whatever
        for (var i = 0; i < this.nodesVirus.length; i++) {
            var check = this.nodesVirus[i];
            if (check === null) continue;
            if (this.checkCellCollision(cell, check) != null) {
                return check;
            }
        }
    };
    // this is almost same to the legacy function
    GameServer.prototype.checkRigidCollision = function (manifold) {
        if (this.gameMode.state != GameState.IN_PROGRESS)
            return false;
        if (!manifold.cell1.owner || !manifold.cell2.owner)
            return false;
        if (manifold.cell1.owner != manifold.cell2.owner) {
            // Different owners
            if ((this.gameMode.hasEatenHero(manifold.cell2.owner)) || (this.gameMode.hasEatenHero(manifold.cell1.owner))) 
                return false;
            if (manifold.cell1.owner.getTeam() == 0 || manifold.cell2.owner.getTeam() == 0)
                return true;
            return this.gameMode.haveTeams && manifold.cell1.owner.getTeam() == manifold.cell2.owner.getTeam();
        }
        // The same owner
        if (manifold.cell1.owner.mergeOverride || manifold.cell1.owner.autoMerge)
            return false;
        var tick = this.getTick();
        if (manifold.cell1.getAge(tick) < 15 || manifold.cell2.getAge(tick) < 15) {
            // just splited => ignore
            return false;
        }
        return !manifold.cell1.canRemerge() || !manifold.cell2.canRemerge();
    };
    GameServer.prototype.resolveRigidCollision = function (manifold, border) {
        // distance from cell1 to cell2
        var d = Math.sqrt(manifold.squared);
        if (d <= 0) return;
        var invd = 1 / d;
        // normal
        var nx = ~~manifold.dx * invd;
        var ny = ~~manifold.dy * invd;
        // body penetration distance
        var penetration = manifold.r - d;
        if (penetration <= 0) return;
        // penetration vector = penetration * normal
        var px = penetration * nx;
        var py = penetration * ny;
        // body impulse
        var totalMass = manifold.cell1.getSizeSquared() + manifold.cell2.getSizeSquared();
        if (totalMass <= 0) return;
        var invTotalMass = 1 / totalMass;
        var crazyClient = null;
        var impulse1 = manifold.cell2.getSizeSquared() * invTotalMass;
        var impulse2 = manifold.cell1.getSizeSquared() * invTotalMass;
        if (manifold.cell1.owner && manifold.cell2.owner) {
            if (manifold.cell2.owner.getTeam() == 0 && manifold.cell1.owner.getTeam() != 0) {
                crazyClient = manifold.cell1.owner;
            } else if (manifold.cell1.owner.getTeam() == 0 && manifold.cell2.owner.getTeam() != 0) {
                crazyClient = manifold.cell2.owner;
            }
            if (crazyClient != null && !this.gameMode.isCrazy(crazyClient)) {
                crazyClient.crazyTimer = this.gameMode.crazyDuration;
                crazyClient.colorToggle = 0;
                this.gameMode.boostSpeed(crazyClient);
            }
        }
        // apply extrusion force
        manifold.cell1.position.x -= px * impulse1;
        manifold.cell1.position.y -= py * impulse1;
        manifold.cell2.position.x += px * impulse2;
        manifold.cell2.position.y += py * impulse2;
        // clip to border bounds
        manifold.cell1.checkBorder(border);
        manifold.cell2.checkBorder(border);
    };
    GameServer.prototype.resolveCollision = function (manifold) {
        if (this.gameMode.state != GameState.IN_PROGRESS)
            return false;
        var minCell = manifold.cell1;
        var maxCell = manifold.cell2;
        // check if any cell already eaten
        if (minCell.isRemoved || maxCell.isRemoved)
            return;
        if (minCell.getSize() > maxCell.getSize()) {
            minCell = manifold.cell2;
            maxCell = manifold.cell1;
        }
        // check distance
        var eatDistance = maxCell.getSize() - minCell.getSize() / 3;
        if (manifold.squared >= eatDistance * eatDistance) {
            // too far => can't eat
            return;
        }
        if (minCell.owner && minCell.owner == maxCell.owner) {
            // collision owned/owned => ignore or resolve or remerge
            var tick = this.getTick();
            if (minCell.getAge(tick) < 15 || maxCell.getAge(tick) < 15) {
                // just splited => ignore
                return;
            }
            if (!minCell.owner.mergeOverride && !minCell.owner.autoMerge) {
                // not force remerge => check if can remerge
                if (!minCell.canRemerge() || !maxCell.canRemerge()) {
                    // cannot remerge
                    return;
                }
            }
        } else {
            // collision owned/enemy => check if can eat
            // Team check
            if (this.gameMode.haveTeams && minCell.owner && maxCell.owner) {
                if (minCell.owner.getTeam() == maxCell.owner.getTeam()) {
                    // cannot eat team member
                    return;
                }
            }
            // Size check
            if (maxCell.getSize() <= minCell.getSize() * 1.15) {
                // too large => can't eat
                return;
            }
        }
        if (!maxCell.canEat(minCell)) {
            // maxCell don't want to eat
            return;
        }
        if (manifold.cell1.owner) {
            if (manifold.cell1.owner.getTeam() == 0) {
                // Z team
                if (manifold.cell2.getType() == CellType.HERO)
                    return;
            } else {
                // H team
                if (manifold.cell2.getType() == CellType.BRAIN)
                    return;
            }
        }
        // Now maxCell can eat minCell
        minCell.isRemoved = true;
        // Disable mergeOverride on the last merging cell
        // We need to disable it before onCosume to prevent merging loop
        // (onConsume may cause split for big mass)
        if (minCell.owner && minCell.owner.cells.length <= 2) {
            minCell.owner.mergeOverride = false;
            minCell.owner.autoMerge = false;
        }
        var isMinion = (maxCell.owner && maxCell.owner.isMinion) ||
            (minCell.owner && minCell.owner.isMinion);
        if (!isMinion) {
            // Consume effect
            maxCell.onEat(minCell);
            minCell.onEaten(maxCell);
            // update bounds
            this.updateNodeQuad(maxCell);
        }
        // Remove cell
        minCell.setKiller(maxCell);
        this.removeNode(minCell);
    };
    // this is almost same to the legacy function
    GameServer.prototype.splitPlayerCell = function (client, parent, angle, mass) {
        // Returns boolean whether a cell has been split or not. You can use this in the future.
        
        if (client.cells.length >= this.config.playerMaxCells) {
            // Player cell limit
            return false;
        }
        
        var size1 = 0;
        var size2 = 0;
        if (mass == null) {
            size1 = parent.getSplitSize();
            size2 = size1;
        } else {
            size2 = Math.sqrt(mass * 100);
            size1 = Math.sqrt(parent.getSize() * parent.getSize() - size2 * size2);
        }
        if (isNaN(size1) || size1 < this.config.playerMinSize) {
            return false;
        }
        
        // Remove mass from parent cell first
        parent.setSize(size1);
        
        // make a small shift to the cell position to prevent extrusion in wrong direction
        var pos = {
            x: parent.position.x + 40 * Math.sin(angle),
            y: parent.position.y + 40 * Math.cos(angle)
        };
        
        // Create cell
        var newCell = new Entity.PlayerCell(this, client, pos, size2);
        newCell.setBoost(780, angle);
        if (this.gameMode.hasEatenBrain(client) || this.gameMode.isCrazy(client)) {
            this.gameMode.boostSpeedCell(newCell);
        }
        // gain effect if human eat hero
        else if (this.gameMode.hasEatenHero(client)) {
            for (let i = 0; i < client.cells.length; i++) {
                var cell = client.cells[i];
                client.autoMerge = true;
            }
        }
        // Add to node list
        this.addNode(newCell);
        return true;
    };
    Virus.prototype.onEaten = function (consumer) {
        var client = consumer.owner;
        if (client == null) return;
        var maxSplit = this.gameServer.config.playerMaxCells - consumer.owner.cells.length;
        var masses = this.gameServer.splitMass(consumer.getMass(), maxSplit + 1);
        if (masses.length < 2) {
            return;
        }
        // Balance mass around center & skip first mass (==consumer mass)
        var massesMix = [];
        for (var i = 1; i < masses.length; i += 2)
            massesMix.push(masses[i]);
        for (var i = 2; i < masses.length; i += 2)
            massesMix.push(masses[i]);
        masses = massesMix;
        // Blow up the cell...
        var angle = 2 * Math.PI * Math.random();
        var step = 2 * Math.PI / masses.length;
        for (var i = 0; i < masses.length; i++) {
            if (!this.gameServer.splitPlayerCell(client, consumer, angle, masses[i])) {
                break;
            }
            angle += step;
            if (angle >= 2 * Math.PI) {
                angle -= 2 * Math.PI;
            }
        }
        if (this.gameServer.gameMode.hasEatenHero(client)) {
            for (let i = 0; i < client.cells.length; i++) {
                var cell = client.cells[i];
                client.autoMerge = true;
            }
        }
    };
    
    // Handle "gamemode" command:
    for (var i = 0; i < gameServer.clients.length; i++) {
        var client = gameServer.clients[i].playerTracker;
        if (!client)
            continue;
        
        if (client.cells.length > 0) {
            client.eatenBrainTimer = 0;
            client.eatenHeroTimer = 0;
            client.crazyTimer = 0;
            client.setColor(this.defaultColor);
            client.team = 1;
            for (var j = 0; j < client.cells.length; j++) {
                var cell = client.cells[j];
                cell.setColor(this.defaultColor);
            }
            this.humans.push(client);
        }
    }
};

TeamZ.prototype.onChange = function (gameServer) {
    // Called when someone changes the gamemode via console commands
    // remove Brain and Hero
    var i = 0;
    for (i = 0; gameServer.nodesBrain.length; i++) {
        var node = gameServer.nodesBrain[i];
        gameServer.removeNode(node);
    }
    gameServer.nodesBrain = [];
    for (i = 0; gameServer.nodesHero.length; i++) {
        var node = gameServer.nodesHero[i];
        gameServer.removeNode(node);
    }
    gameServer.nodesHero = [];
    
    // discard all boost:
    for (i = 0; i < this.humans.length; i++) {
        var client = this.humans[i];
        if (this.isCrazy(client)) {
            this.resetSpeed(client);
        }
    }
    for (i = 0; i < this.zombies.length; i++) {
        var client = this.zombies[i];
        if (this.hasEatenBrain(client)) {
            this.resetSpeed(client);
        }
    }
    
    // revert to default:
    GameServer.prototype.getRandomColor = GS_getRandomColor;
    GameServer.prototype.getNearestVirus = GS_getNearestVirus;
    GameServer.prototype.checkRigidCollision = GS_checkRigidCollision;
    GameServer.prototype.resolveRigidCollision = GS_resolveRigidCollision;
    GameServer.prototype.resolveCollision = GS_resolveCollision;
    GameServer.prototype.splitPlayerCell = GS_splitPlayerCell;
    Virus.prototype.onEaten = Virus_onEaten;
};

TeamZ.prototype.onTick = function (gameServer) {
    // Called on every game tick
    
    switch (this.state) {
        case GameState.WF_PLAYERS:
            if (this.humans.length >= this.minPlayer) {
                this.state = GameState.WF_START;
                this.gameTimer = this.warmUpDuration;
            }
            break;
        case GameState.WF_START:
            this.gameTimer--;
            if (this.gameTimer == 0) {
                if (this.humans.length >= this.minPlayer) {
                    // proceed:
                    this.startGame(gameServer);
                } else {
                    // back to previous state:
                    this.state = GameState.WF_PLAYERS;
                }
            }
            break;
        case GameState.IN_PROGRESS:
            this.gameTimer--;
            if (this.gameTimer == 0) {
                // human wins
                this.winTeam = 1;
            } else {
                if (this.humans.length == 0) { // no human left
                    // zombie wins
                    this.winTeam = 0;
                } else if (this.zombies.length == 0) { // no zombie left
                    // human wins
                    this.winTeam = 1;
                }
            }
            
            if (this.winTeam >= 0) {
                this.endGame(gameServer);
            }
            
            break;
    }
    
    // change color of zombies
    for (var i = 0; i < this.zombies.length; i++) {
        var client = this.zombies[i];
        this.nextZColorFactor(client);
        
        if (this.hasEatenBrain(client)) {
            client.eatenBrainTimer--;
            
            if (client.eatenBrainTimer > 0) {
                this.updateZColor(client, 0x5); // Pink
                continue;
            } else {
                // reset speed:
                this.resetSpeed(client);
            }
        }
        
        this.updateZColor(client, 0x7); // Gray
    }
    
    for (var i = 0; i < this.humans.length; i++) {
        var client = this.humans[i];
        if (this.isCrazy(client)) {
            client.crazyTimer--;
            if (client.crazyTimer == 0) {
                for (var j = 0; j < client.cells.length; j++) {
                    var cell = client.cells[j];
                    // reset speed:
                    this.resetSpeedCell(cell);
                    
                    // reset color:
                    if (client.cured == true)
                        cell.setColor(client.getColor());
                }
                
                if (client.cured == true) {
                    client.cured = false; // reset
                } else {
                    // turn player to zombie
                    this.turnToZombie(client);
                    continue;
                }
            } else {
                client.colorToggle++;
                if (client.colorToggle % 10 == 0) {
                    var blinkColor = null;
                    
                    if (client.colorToggle == 20) {
                        blinkColor = client.getColor();
                        client.colorToggle = 0;
                    } else {
                        if (client.cured == true) {
                            blinkColor = {
                                r: 255,
                                g: 255,
                                b: 7
                            }; // Yellow
                        } else {
                            blinkColor = {
                                r: 75,
                                g: 75,
                                b: 75
                            }; // Gray
                        }
                    }
                    
                    for (var j = 0; j < client.cells.length; j++) {
                        var cell = client.cells[j];
                        cell.setColor(blinkColor);
                    }
                }
            }
        } else if (this.hasEatenHero(client)) {
            client.eatenHeroTimer--;
            var color = null;
            if (client.eatenHeroTimer > 0) {
                client.heroColorFactor = (client.heroColorFactor + 5) % 401;
                if (client.heroColorFactor <= 200) {
                    color = {
                        r: 255,
                        g: 255,
                        b: client.heroColorFactor
                    }; // Yellow scheme
                } else {
                    color = {
                        r: 255,
                        g: 255,
                        b: 400 - client.heroColorFactor
                    }; // Yellow scheme
                }
            } else {
                color = client.getColor(); // reset
            }
            
            for (var j = 0; j < client.cells.length; j++) {
                var cell = client.cells[j];
                cell.setColor(color);
            }
        }
    }
    
    // check timer to spawn Hero:
    this.spawnHeroTimer++;
    if (this.spawnHeroTimer >= this.spawnHeroInterval) {
        this.spawnHeroTimer = 0;
        var max = this.maxHero < 0 ? this.zombies.length : this.maxHero;
        if (gameServer.nodesHero.length < max) {
            var pos = gameServer.getRandomPosition();
            if (!gameServer.willCollide(pos, 78)) {
                var cell = new Entity.Hero(gameServer, null, pos, 78);
                gameServer.addNode(cell);
            }
        }
    }
    
    // check timer to spawn Brain:
    this.spawnBrainTimer++;
    if (this.spawnBrainTimer >= this.spawnBrainInterval) {
        this.spawnBrainTimer = 0;
        var max = this.maxBrain < 0 ? this.humans.length : this.maxBrain;
        if (gameServer.nodesBrain.length < max) {
            var pos = gameServer.getRandomPosition();
            if (!gameServer.willCollide(pos, 78)) {
                var cell = new Entity.Brain(gameServer, null, pos, 78);
                gameServer.addNode(cell);
            }
        }
    }
};

TeamZ.prototype.onCellAdd = function (cell) {
    // Called when a player cell is added
    var client = cell.owner;
    if (client.cells.length == 1) { // first cell
        client.team = client.pID;
        client.setColor(cell.getColor());
        client.eatenBrainTimer = 0;
        client.eatenHeroTimer = 0;
        client.crazyTimer = 0;
        this.humans.push(client);
        if (this.state == GameState.IN_PROGRESS) {
            this.turnToZombie(client);
        } else {
            client.setColor(this.defaultColor);
            cell.setColor(this.defaultColor);
            client.team = 1; // game not started yet
        }
    }
};

TeamZ.prototype.onCellRemove = function (cell) {
    // Called when a player cell is removed
    var client = cell.owner;
    if (client.cells.length == 0) { // last cell
        if (client.getTeam() == 0) {
            // Z team
            var index = this.zombies.indexOf(client);
            if (index >= 0)
                this.zombies.splice(index, 1);
        } else {
            // H team
            var index = this.humans.indexOf(client);
            if (index >= 0)
                this.humans.splice(index, 1);
        }
    }
};

TeamZ.prototype.updateLB = function (gameServer) {
    gameServer.leaderboardType = this.packetLB;
    var lb = gameServer.leaderboard;
    
    if (this.winTeam == 0) {
        lb.push('ZOMBIE WINS');
        lb.push('_______________');
    } else if (this.winTeam > 0) {
        lb.push('HUMAN WINS');
        lb.push('_______________');
    }
    
    switch (this.state) {
        case GameState.WF_PLAYERS:
            lb.push('WAITING FOR');
            lb.push('PLAYERS...');
            lb.push(this.humans.length + '/' + this.minPlayer);
            break;
        case GameState.WF_START:
            lb.push('GAME STARTS IN:');
            var min = (this.gameTimer / 20 / 60) >> 0;
            var sec = ((this.gameTimer / 20) >> 0) % 60;
            lb.push((min < 10 ? '0' : '') + min + ':' + (sec < 10 ? '0' : '') + sec);
            break;
        case GameState.IN_PROGRESS:
            var min = (this.gameTimer / 20 / 60) >> 0;
            var sec = ((this.gameTimer / 20) >> 0) % 60;
            lb.push((min < 10 ? '0' : '') + min + ':' + (sec < 10 ? '0' : '') + sec);
            lb.push('HUMAN: ' + this.humans.length);
            lb.push('ZOMBIE: ' + this.zombies.length);
            lb.push('_______________');
            
            // Loop through all clients
            localLB = [];
            for (var i = 0; i < gameServer.clients.length; i++) {
                if (typeof gameServer.clients[i] == 'undefined' || gameServer.clients[i].playerTracker.team == 0) {
                    continue;
                }
                
                var player = gameServer.clients[i].playerTracker;
                if (player.cells.length <= 0) {
                    continue;
                }
                var playerScore = player.getScore();
                
                if (localLB.length == 0) {
                    // Initial player
                    localLB.push(player);
                    continue;
                } else if (localLB.length < 6) {
                    this.leaderboardAddSort(player, localLB);
                } else {
                    // 6 in leaderboard already
                    if (playerScore > localLB[5].getScore()) {
                        localLB.pop();
                        this.leaderboardAddSort(player, localLB);
                    }
                }
            }
            for (var i = 0; i < localLB.length && lb.length < 10; i++) {
                lb.push(localLB[i].getName());
            }
            
            break;
        default:
            lb.push('ERROR STATE');
            break;
    }

};