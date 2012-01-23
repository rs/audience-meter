var cluster = require('cluster');

exports.Master = Master;

function Master(options)
{
    if (!(this instanceof Master)) return new Master(options);

    if (!options.workers)
    {
        options.workers = require('os').cpus().length;
    }

    var workers = [];

    function workerMessageHandler(msg)
    {
        switch (msg.cmd)
        {
            case 'join':
                options.audience.join(msg.namespace);
                break;
            case 'leave':
                options.audience.leave(msg.namespace);
                break;

            case 'exclude':
                for (var i = 0, t = workers.length; i < t; i++)
                {
                    var worker = workers[i];
                    if (this == worker) continue;
                    worker.send(msg);
                }
                // TODO: instruct other peers of same UDP multicast segment if cluster is activated
                break;
        }
    }

    for (var i = 0; i < options.workers; i++)
    {
        var worker = cluster.fork();
        workers.push(worker);
        worker.on('message', workerMessageHandler);
    }

    options.audience.on('notify', function(namespace)
    {
        workers.forEach(function(worker)
        {
            worker.send({cmd: 'notify', namespace: namespace.name, total: namespace.members});
        });
    });

    process.on('SIGTERM', function()
    {
        workers.forEach(function(worker)
        {
            worker.kill();
        });
        process.exit();
    });
}