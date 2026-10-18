var Cell = require('../entity/Cell.js');

function Hero() {
    Cell.apply(this, Array.prototype.slice.call(arguments));
    
    this.cellType = 130;
    //this.isSpiked = true;
    this.isMotherCell = false; // Not to confuse bots
    this.setColor({ r: 0x33, g: 0xff, b: 0x33 });
}

module.exports = Hero;
Hero.prototype = new Cell();

Hero.prototype.canEat = function (cell) {
    return cell.cellType == 3; // hero can eat ejected mass only
};

Hero.prototype.onEat = function (prey) {
    var client = prey.owner;
    if (client == null) return;
    this.gameServer.removeNode(prey)
    this.setBoost(60 * 5, feeder.getAngle());
};

Hero.prototype.onEaten = function (consumer) {
    var client = consumer.owner;
    if (client == null) return;
    if (this.gameServer.gameMode.isCrazy(client)) {
        client.cured = true
    } else {
        client.eatenHeroTimer = this.gameServer.gameMode.heroEffectDuration;
        client.heroColorFactor = 0;
        for (var i = 0; i < client.cells.length; i++) {
            var cell = client.cells[i];
            client.autoMerge = true;
        }
    }
};

Hero.prototype.onAdd = function (gameServer) {
    gameServer.nodesHero.push(this);
};

Hero.prototype.onRemove = function (gameServer) {
    var index = gameServer.nodesHero.indexOf(this);
    if (index != -1) {
        gameServer.nodesHero.splice(index, 1);
    } else {
        Logger.error("Hero.onRemove: Tried to remove a non existing hero!");
    }
};