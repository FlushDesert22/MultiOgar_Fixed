var Mode = require('./Mode');

var GS_checkRigidCollision = null;
var GS_resolveRigidCollision = null;
function Zombie() {
    Mode.apply(this, Array.prototype.slice.call(arguments));
    
    this.ID = 12;
    this.name = "Zombie FFA";
    this.haveTeams = true;
    this.zombieColor = {
        'r': 223,
        'g': 223,
        'b': 223
    };
    this.zombies = [];
    this.players = [];
}

module.exports = Zombie;
Zombie.prototype = new Mode();

// Gamemode Specific Functions

Zombie.prototype.leaderboardAddSort = function (player, leaderboard) {
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

Zombie.prototype.makeZombie = function (player) {
    // turns a player into a zombie
    player.team = 0;
    player.setColor(this.zombieColor);
    for (var i = 0; i < player.cells.length; i++) {
        // remove cell from players array
        var index = this.players.indexOf(player.cells[i]);
        if (index != -1) {
            this.players.splice(index, 1);
        }
        // change color of cell
        player.cells[i].setColor(this.zombieColor);
        // add cell to zombie array
        this.zombies.push(player.cells[i]);
    }
};

// Override

Zombie.prototype.onPlayerSpawn = function (gameServer, player) {
    // make player a zombie if there are none
    if (this.zombies.length == 0) {
        player.team = 0;
        player.setColor(this.zombieColor);
    } else {
        // use player id as team so that bots are still able to fight (even though they probably turn into zombies very fast)
        player.team = player.pID;
        player.setColor(gameServer.getRandomColor());
    }
    
    // Spawn player
    gameServer.spawnPlayer(player);
};

Zombie.prototype.onCellAdd = function (cell) {
    // Add to team list
    if (cell.owner.getTeam() == 0) {
        this.zombies.push(cell);
    } else {
        this.players.push(cell);
    }
};

Zombie.prototype.onCellRemove = function (cell) {
    // Remove from team list
    if (cell.owner.getTeam() == 0) {
        var index = this.zombies.indexOf(cell);
        if (index != -1) {
            this.zombies.splice(index, 1);
        }
    } else {
        var index = this.players.indexOf(cell);
        if (index != -1) {
            this.players.splice(index, 1);
        }
    }
};

Zombie.prototype.onServerInit = function (gameServer) {
    // Called when the server starts
    gameServer.run = true;
    
    // Overwrite some server functions:
    GameServer = require('../GameServer.js');
    GS_checkRigidCollision = GameServer.prototype.checkRigidCollision;
    GS_resolveRigidCollision = GameServer.prototype.resolveRigidCollision;
    GameServer.prototype.checkRigidCollision = function (manifold) {
        if (!manifold.cell1.owner || !manifold.cell2.owner)
            return false;
        if (manifold.cell1.owner != manifold.cell2.owner) {
            // Different owners
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
        var impulse1 = manifold.cell2.getSizeSquared() * invTotalMass;
        var impulse2 = manifold.cell1.getSizeSquared() * invTotalMass;
        if (manifold.cell1.owner && manifold.cell2.owner) {
            if (manifold.cell2.owner.getTeam() == 0 && manifold.cell1.owner.getTeam() != 0) {
                this.gameMode.makeZombie(manifold.cell1.owner);
            } else if (manifold.cell1.owner.getTeam() == 0 && manifold.cell2.owner.getTeam() != 0) {
                this.gameMode.makeZombie(manifold.cell2.owner);
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
};

Zombie.prototype.onChange = function (gameServer) {
    GameServer.prototype.checkRigidCollision = GS_checkRigidCollision;
    GameServer.prototype.resolveRigidCollision = GS_resolveRigidCollision;
};

Zombie.prototype.updateLB = function (gameServer) {
    gameServer.leaderboardType = this.packetLB;
    var lb = gameServer.leaderboard;
    // Loop through all clients
    for (var i = 0; i < gameServer.clients.length; i++) {
        if (typeof gameServer.clients[i] == "undefined" || gameServer.clients[i].playerTracker.team == 0) {
            continue;
        }
        
        var player = gameServer.clients[i].playerTracker;
        var playerScore = player.getScore();
        if (player.cells.length <= 0) {
            continue;
        }
        
        if (lb.length == 0) {
            // Initial player
            lb.push(player);
            continue;
        } else if (lb.length < 10) {
            this.leaderboardAddSort(player, lb);
        } else {
            // 10 in leaderboard already
            if (playerScore > lb[9].getScore()) {
                lb.pop();
                this.leaderboardAddSort(player, lb);
            }
        }
    }
    
    this.rankOne = lb[0];
};
