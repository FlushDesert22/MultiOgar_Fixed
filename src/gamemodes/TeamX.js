var Teams = require('./Teams'); // Base gamemode
var Entity = require('../entity');
var Logger = require('../modules/Logger');

var Virus_onEat = null;

function TeamX() {
    Teams.apply(this, Array.prototype.slice.call(arguments));
    
    this.ID = 14;
    this.name = "Experimental Team";
    this.specByLeaderboard = true;
    
    // Gamemode Specific Variables
    this.tickMotherSpawn = 0;
    this.tickMotherUpdate = 0;
    
    // Config
    this.motherSpawnInterval = 25 * 5;  // How many ticks it takes to spawn another mother cell (5 seconds)
    this.motherUpdateInterval = 5;     // How many ticks it takes to spawn mother food (1 second)
    this.motherMinAmount = 20;
    this.motherMaxAmount = 30;
}

module.exports = TeamX;
TeamX.prototype = new Teams();

// Gamemode Specific Functions

TeamX.prototype.spawnMotherCell = function (gameServer) {
    // Checks if there are enough mother cells on the map
    if (gameServer.nodesMother.length >= this.motherMinAmount) {
        return;
    }
    // Spawns a mother cell
    var pos = gameServer.getRandomPosition();
    if (gameServer.willCollide(pos, 149)) {
        // cannot find safe position => do not spawn
        return;
    }
    // Spawn if no cells are colliding
    var mother = new Entity.MotherCell(gameServer, null, pos, null);
    gameServer.addNode(mother);
};

// Override

TeamX.prototype.onServerInit = function (gameServer) {
    // Called when the server starts
    gameServer.run = true;

    // Set up teams
    for (var i = 0; i < this.teamAmount; i++) {
        this.nodes[i] = [];
    }
    
    // migrate current players to team mode
    for (var i = 0; i < gameServer.clients.length; i++) {
        var client = gameServer.clients[i].playerTracker;
        this.onPlayerInit(client);
        client.setColor(this.getTeamColor(client.team));
        for (var j = 0; j < client.cells.length; j++) {
            var cell = client.cells[j];
            cell.setColor(client.getColor());
            this.nodes[client.team].push(cell);
        }
    }
    
    var mapSize = Math.max(gameServer.border.width, gameServer.border.height);
    
    // 7 mother cells for vanilla map size
    //this.motherMinAmount = Math.ceil(mapSize / 2000);
    //this.motherMaxAmount = this.motherMinAmount * 2;
    
    var self = this;
    // Override
    
    // Special virus mechanics
    Virus_onEat = Entity.Virus.prototype.onEat;
    Entity.Virus.prototype.onEat = function (prey) {
        // Pushes the virus
        var angle = prey.isMoving ? prey.getAngle() : this.getAngle();
        this.setBoost(16 * 20, angle);
    };
};

TeamX.prototype.onChange = function (gameServer) {
    // Remove all mother cells
    for (var i in gameServer.nodesMother) {
        gameServer.removeNode(gameServer.nodesMother[i]);
    }
    gameServer.nodesMother = [];
    // Add back default functions
    Entity.Virus.prototype.onEat = Virus_onEat;
};

TeamX.prototype.onTick = function (gameServer) {
    // Mother Cell Spawning
    if (this.tickMotherSpawn >= this.motherSpawnInterval) {
        this.tickMotherSpawn = 0;
        this.spawnMotherCell(gameServer);
    } else {
        this.tickMotherSpawn++;
    }
    if (this.tickMotherUpdate >= this.motherUpdateInterval) {
        this.tickMotherUpdate = 0;
        for (var i = 0; i < gameServer.nodesMother.length; i++) {
            gameServer.nodesMother[i].onUpdate();
        }
    } else {
        this.tickMotherUpdate++;
    }
};

