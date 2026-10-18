var Cell = require('../entity/Cell.js');

function Brain() {
    Cell.apply(this, Array.prototype.slice.call(arguments));
    
    this.cellType = 131;
    //this.isSpiked = true;
    this.isMotherCell = false; // Not to confuse bots
    this.setColor({ r: 0xff, g: 0x07, b: 0xff });
}

module.exports = Brain;
Brain.prototype = new Cell();

// Main Functions

Brain.prototype.canEat = function (cell) {
    return cell.cellType == 3; // hero can eat ejected mass only
};

Brain.prototype.onEat = function (prey) {
    var client = prey.owner;
    if (client == null) return;
    this.gameServer.removeNode(prey)
    this.setBoost(60 * 5, feeder.getAngle());
};

Brain.prototype.onEaten = function (consumer) {
    var client = consumer.owner;
    if (client == null) return;
    client.eatenBrainTimer = this.gameServer.gameMode.brainEffectDuration;
    // Boost speed
    this.gameServer.gameMode.boostSpeed(client);
};

Brain.prototype.onAdd = function (gameServer) {
    gameServer.nodesBrain.push(this);
};

Brain.prototype.onRemove = function (gameServer) {
    var index = gameServer.nodesBrain.indexOf(this);
    if (index != -1) {
        gameServer.nodesBrain.splice(index, 1);
    } else {
        Logger.error("Brain.onRemove: Tried to remove a non existing brain!");
    }
};