#!/usr/bin/env node

var options = require('commander'),
    http = require('http'),
    util = require('util');

options
    .option('-H, --host <host>', 'The host to connect to (default localhost)', String, '127.0.0.1')
    .option('-e, --concurrent-events <num>', 'Number of concurrent events to create', parseInt, 10)
    .option('-c, --concurrent-clients <num>', 'Number of concurrent clients', parseInt, 1000)
    .option('-p, --event-prefix <prefix>', 'String to prefix to generated event names', String, 'bench')
    .option('-s, --speed <msec>', 'Number of approx milliseconds to wait between connections', parseInt, 100)
    .parse(process.argv);


var started = 0,
    connected = 0,
    ended = 0,
    misses = 0,
    messages = 0,
    errors = 0,
    eventNames = [];

for (var i = 0; i <= options.concurrentEvents; i++)
{
    eventNames.push(options.eventPrefix + i);
}

spawnClient();

setInterval(function()
{
    process.stdout.write(util.format('Started: %d, connected: %d, closed: %d, errors: %d, missed: %d, msgs: %d\r',
                                      started, connected, ended, errors, misses, messages));
}, 500);

function spawnClient(eventName)
{
    if (!eventName)
    {
        eventName = eventNames[Math.floor(Math.random() * options.concurrentEvents)];
    }

    var client = http.get
    ({
        host: options.host,
        port: 80,
        path: '/' + eventName,
        headers: {Accept: 'text/event-stream'},
        agent: false
    });
    var interval = setInterval(function()
    {
        if (new Date().getTime() - client.lastMessage > 60000)
        {
            misses++;
        }
    }, 60000);
    client.on('error', function()
    {
        started--;
        errors++;
    });
    client.on('response', function(res)
    {
        connected++;
        res.on('data', function(data)
        {
            client.lastMessage = new Date().getTime();
            messages++;
        });
        res.on('end', function()
        {
            clearInterval(interval);
            started--;
            connected--;
            ended++;
            // reconnect
            spawnClient(eventName);
        });
    });


    if (++started < options.concurrentClients)
    {
        setTimeout(spawnClient, Math.random() * options.speed);
    }
}