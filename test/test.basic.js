var test = require('unit.js');

var MemcachedClient = require("memcached");
var MemcachedServer = require("../lib/server");

var client = new MemcachedClient();
var server = new MemcachedServer();

describe("memcached server", function () {
    var client;
    var server;

    before(function (done) {
        server = new MemcachedServer();
        server.listen(0, "127.0.0.1").then(function () {
            var address = server.address();
            client = new MemcachedClient(address.address + ":" + address.port);
            done();
        });
    });

    it("can set values", function (done) {
        client.set("value", "test", 10, function (err) {
            test.value(err).isFalsy();
            done();
        });
    });

    it("can get values", function (done) {
        client.get("value", function (err, data) {
            test.value(err).isFalsy();
            test.string(data).isEqualTo("test");
            done();
        });
    });

    it("can delete values", function (done) {
        client.del("value", function (err) {
            test.value(err).isFalsy();
            done();
        });
    });

    it("expires values", function (done) {
        client.set("value", "not-expired", 1, function (err) {
            test.value(err).isFalsy();
            setTimeout(function () {
                client.get("value", function (err, data) {
                    test.value(err).isFalsy();
                    test.undefined(data);
                    done();
                });
            }, 1200);
        });
    });
});
