// Import
var BinaryWriter = require("./BinaryWriter");

function DrawLine(x, y) {
    this.x = x;
    this.y = y;
}

module.exports = DrawLine;

DrawLine.prototype.build = function (protocol) {
    var writer = new BinaryWriter();
    writer.writeUInt8(0x15, 0);
    writer.writeInt16(this.x);
    writer.writeInt16(this.y);
    return writer.toBuffer();    
};
