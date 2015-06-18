var _ = require('lodash');
var redis = require('redis');


exports.init = function instrumental_init(startup_time, config, events) {
    var redisStats = {};

    var redisConfig = {
        host: 'localhost',
        port: 6379,
        db: 0,
        precision: 60 * 60 * 24, // day
        historyLength: 30,
        regexp: null
    };

    if (config.redis) {
        _.extend(redisConfig, config.redis);
    }

    if (redisConfig.regexp) {
        redisConfig.regexp = new RegExp(redisConfig.regexp);
    }

    var client = redis.createClient(redisConfig.port, redisConfig.host);
    client.select(redisConfig.db);

    redisStats.last_flush = startup_time;
    redisStats.last_exception = startup_time;


    function flush(timeStamp, metrics) {
        var today = new Date();
        today.setHours(0, 0, 0, 0);
        // calculate timeStamp with precision
        var precisionTimeStamp = today.getTime() / 1000 + Math.floor((timeStamp - today.getTime() / 1000) / redisConfig.precision) * redisConfig.precision;

        _.each(metrics.counters, function (value, key) {
            if (redisConfig.regexp && !redisConfig.regexp.test(key)) {
                return;
            }

            key = key.replace(/\./g, ':');
            client.hincrby(key, precisionTimeStamp, value, function (err, res) {
                if (err) {
                    redisStats.last_exception = timeStamp;
                    console.error(err);
                }
            });

            // cleanup
            client.hkeys(key, function (err, res) {
                if (err) {
                    redisStats.last_exception = timeStamp;
                    console.error(err);
                }

                if (res.length > redisConfig.historyLength) {
                    var args = res.sort().slice(0, res.length - redisConfig.historyLength);
                    args.unshift(key);
                    args.push(function (err, res) {
                        if (err) {
                            redisStats.last_exception = timeStamp;
                            console.error(err);
                        }
                    });
                    client.hdel.apply(client, args)
                }
            })
        });
    }

    events.on("flush", flush);
    //events.on("status", instrumental_status);

    return true;
};