var cluster = require('cluster');

exports.Master = Master;

function Master(options)
{
    if (!(this instanceof Master)) return new Master(options);

    if (!options.workers)
    {
        options.workers = require('os').cpus().length;
    }

    var eachWorker = function(callback)
    {
        for (var id in cluster.workers)
        {
            callback(cluster.workers[id]);
        }
    };

    cluster.on('online', function(worker)
    {
        worker.on('message', function(msg)
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
                    eachWorker(function(otherWorker)
                    {
                        if (worker !== otherWorker)
                        {
                            otherWorker.send(msg);
                        }
                    });
                    // TODO: instruct other peers of same UDP multicast segment if cluster is activated
                    break;
            }
        });
    });

    cluster.on('exit', function(worker, code, signal)
    {
        if (worker.suicide === true)
        {
            return;
        }

        options.log('warn', 'Respawn worker');
        cluster.fork();
    });

    for (var i = 0; i < options.workers; i++)
    {
        cluster.fork();
    }

    options.audience.on('notify', function(namespace, msg)
    {
        eachWorker(function(worker)
        {
            if (typeof msg == 'undefined')
            {
                msg = namespace.members;
            }

            worker.send({cmd: 'notify', namespace: namespace.name, msg: msg});
        });
    });

    process.on('SIGTERM', function()
    {
        eachWorker(function(worker)
        {
            options.log('debug', 'Disconnect worker ' + worker.id);
            worker.kill();
        });
        process.exit();
    });
}