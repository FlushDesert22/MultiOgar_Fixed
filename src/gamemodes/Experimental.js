var FFA = require('./FFA'); // Base gamemode
var Entity = require('../entity');
var Logger = require('../modules/Logger');


var Virus_onEat = null;

function Experimental() {
    FFA.apply(this, Array.prototype.slice.call(arguments));
    
    this.ID = 2;
    this.name = "Experimental";
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

module.exports = Experimental;
Experimental.prototype = new FFA();

// Gamemode Specific Functions

Experimental.prototype.spawnMotherCell = function (gameServer) {
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

Experimental.prototype.onServerInit = function (gameServer) {
    // Called when the server starts
    gameServer.run = true;
    
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

Experimental.prototype.onChange = function (gameServer) {
    // Remove all mother cells
    for (var i in gameServer.nodesMother) {
        gameServer.removeNode(gameServer.nodesMother[i]);
    }
    gameServer.nodesMother = [];
    // Add back default functions
    Entity.Virus.prototype.onEat = Virus_onEat;
};

Experimental.prototype.onTick = function (gameServer) {
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

