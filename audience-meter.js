var options = require('commander'),
    cluster = require('cluster');

options
    .version('0.3.0')
    .option('-d, --debug', 'Log everything')
    .option('-w, --workers <num>', 'Number of worker processes to spawn (default to the number of CPUs)', parseInt)
    .option('-m, --cluster-addr <ip:port>', 'Use a given multicast IP:PORT to sync several instances of audience-meter ' +
                                            '(disabled by default, prefered address is 239.255.13.37:314)')
    .option('--cluster-notify-interval <seconds>', 'Interval between notifications for a node\'s notification (default 2 seconds', parseInt, 2)
    .option('--cluster-node-timeout <seconds>', 'Delay after which node\'s namespace info will be forgotten if no notification' +
                                                'is recieved by a node (default 5 seconds)', parseInt, 5)
    .option('--sockjs-url', 'URL to the sockjs client library (default is sockjs CDN hosted lib)')
    .option('--notify-delta-ratio <ratio>', 'Minimum delta of number of members to reach before to notify ' +
                                            'listeners based on a fraction of the current number of members (default 0.1)', parseFloat, 0.1)
    .option('--notify-min-delay <seconds>', 'Minimum delay between notifications (default 2)', parseFloat, 2)
    .option('--notify-max-delay <seconds>', 'Maximum delay to wait before not sending notification ' +
                                            'because of min-delta not reached (default 60)', parseFloat, 60)
    .option('--namespace-clean-delay <seconds>', 'Minimum delay to wait before to clean an empty namespace (default 60)', parseFloat, 60)
    .option('--demo-port <port>', 'Public port on which to bind the demo server (default 8080, 0 to disable)', parseInt, 8080)
    .option('--stats-port <port>', 'Local port on which to bind the global stats server (default 1442, 0 to disable)', parseInt, 1442)
    .parse(process.argv);

function logger(severity, message)
{
    if (severity == 'error')
    {
        console.error('[%s] [%s] %s', cluster.isMaster ? 'master' : 'child#' + process.pid, severity, message);
    }
    else if (options.debug)
    {
        console.log('[%s] [%s] %s', cluster.isMaster ? 'master' : 'child#' + process.pid, severity, message);
    }
}

var workerIdx = 0;

if (cluster.isMaster)
{
    process.title = 'audience-meter: master';

    var audience = require('./lib/audience').Audience
    ({
        notify_delta_ratio: options.notifyDeltaRatio,
        notify_min_delay: options.notifyMinDelay,
        notify_max_delay: options.notifyMaxDelay,
        namespace_clean_delay: options.namespaceCleanDelay,
        log: logger
    });

    require('./lib/master').Master
    ({
        workers: options.workers,
        audience: audience
    });

    if (options.demoPort)
    {
        require('./lib/demo').DemoServer({port: options.demoPort});
    }

    if (options.statsPort)
    {
        require('./lib/stats').StatsServer({port: options.statsPort, audience: audience});
    }

    if (options.clusterAddr)
    {
        require('./lib/cluster').ClusterManager
        ({
            notify_interval: options.clusterNotifyInterval,
            node_timeout: options.clusterNodeTimeout,
            multicast_addr: options.clusterAddr,
            audience: audience,
            log: logger
        });
    }
}
else
{
    process.title = 'audience-meter: worker ' + process.env['worker_index'];

    require('./lib/worker').Worker
    ({
        sockjs_client_url: options.sockjsUrl,
        log: logger
    });
}