var net = require("net");
var EventEmitter = require('events').EventEmitter;
var TinyCache = require("tinycache");
var debug = require("debug")("memcached");
var util = require('util');
var Promise = require('promise');

module.exports = (function () {
    function Server() {
        this.server = net.createServer(this.onConnection.bind(this));
        this.cache = new TinyCache();
    }
    util.inherits(Server, EventEmitter);

    Server.STATE_HEADER = 0;
    Server.STATE_BODY = 1;

    Server.prototype.listen = function (port, host) {
        return new Promise(function (resolve, reject) {
            this.server.listen(port, host, function () {
                debug("listening on %s:%d", this.server.address().address, this.server.address().port);
                this.emit('listening');
                resolve();
            }.bind(this));
        }.bind(this));
    };

    Server.prototype.address = function () {
        return this.server.address();
    };

    Server.prototype.onConnection = function (socket) {
        debug("connection from %s:%d", socket.remoteAddress, socket.remotePort);

        var state = Server.STATE_HEADER;
        var buffer = "";
        var header = "";
        var expected_body_length = 0;
        var crlf_length = 2;

        socket.setEncoding('binary');

        socket.on('data', function (data) {
            buffer += data;
            socket.emit('process');
        });

        socket.on('process', function () {
            switch (state) {
                case Server.STATE_HEADER: {
                    var pos = -1;
                    if ((pos = buffer.indexOf('\r\n')) != -1) {
                        header = buffer.slice(0, pos);
                        buffer = buffer.slice(pos + 2);
                        crlf_length = 2;
                    } else if ((pos = buffer.indexOf('\n')) != -1) {
                        header = buffer.slice(0, pos);
                        buffer = buffer.slice(pos + 1);
                        crlf_length = 1;
                    }

                    if (pos != -1) {
                        state = Server.STATE_BODY;
                        expected_body_length = this.onHeader(header, crlf_length);
                        socket.emit('process');
                    }
                } break;
                case Server.STATE_BODY: {
                    if (expected_body_length <= buffer.length) {
                        var body = buffer.slice(0, expected_body_length - crlf_length);
                        buffer = buffer.slice(expected_body_length);

                        state = Server.STATE_HEADER;

                        var response = this.onBody(header, body, socket);
                        socket.write(response, "binary", function () {
                            if (buffer.length > 0) {
                                socket.emit('process');
                            }
                        });
                    }
                } break;
            }
        }.bind(this));
    };

    Server.prototype.onHeader = function (header, crlf_length) {
        var tuples = header.split(" ");
        var expected_body_length = 0;
        switch (tuples[0]) {
            case 'set': {
                expected_body_length  = parseInt(tuples[4]) + crlf_length;
            } break;
        }
        return expected_body_length;
    };

    Server.prototype.onBody = function (header, body, socket) {
        var response = "";
        var tuples = header.split(" ");
        switch (tuples[0]) {
            case 'get': {
                var key = tuples[1];
                debug("get '%s' from %s:%d", key, socket.remoteAddress, socket.remotePort);

                var obj = this.cache.get(key);
                if (obj) {
                    response += "VALUE " + key + " " + obj.flag + " " + obj.data.length + "\r\n";
                    response += obj.data + "\r\n";
                }

                response += "END\r\n";
            } break;
            case 'delete': {
                var key = tuples[1];
                debug("delete '%s' from %s:%d", key, socket.remoteAddress, socket.remotePort);

                this.cache.del(key);

                response += "DELETED\r\n";
            } break;
            case 'set': {
                var key = tuples[1];
                debug("set '%s' (%d bytes) from %s:%d", key, body.length, socket.remoteAddress, socket.remotePort);

                var obj = { flag: tuples[2], expire: 0, data: body };
                this.cache.put(key, obj, tuples[3] * 1000);

                response += "STORED\r\n";
            } break;
            default: {
                debug("unknown command '%s' from %s:%d", tuples[0], socket.remoteAddress, socket.remotePort);
                response += "ERROR\r\n";
            } break;
        }

        return response;
    };

    return Server;
})();
