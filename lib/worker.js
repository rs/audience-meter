var events = require('events'),
    url = require('url'),
    http = require('http'),
    merge = require('./utils').merge;

exports.Worker = Worker;

function Worker(options)
{
    if (!(this instanceof Worker)) return new Worker(options);

    this.options = options = merge
    ({
        uuid: false,
        increment_delay: 0,
        max_conn_duration: 0,
        log: function(severity, message) {console.log(message);}
    }, options);

    this.groups = require('./subscribers').SubscribersGroup({log: options.log});

    var self =  this;
    this.clientRegistry = {};

    process.on('message', function(msg)
    {
        switch (msg.cmd)
        {
            case 'notify':
                self.notify(msg.namespace, msg.total);
                break;

            case 'exclude':
                self.exclude(msg.uuid, false);
                break;
        }
    });

    var path2ns = /^\/([^\/]+)(?:\/([^\/]+))?$/,
        policyFile = '<?xml version="1.0"?>' +
                     '<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">' +
                     '<cross-domain-policy>' +
                     '<site-control permitted-cross-domain-policies="master-only"/>' +
                     '<allow-access-from domain="*" secure="false"/>' +
                     '<allow-http-request-headers-from domain="*" headers="Accept"/>' +
                     '</cross-domain-policy>';

    var server = http.Server();
    server.listen(process.env.PORT or 80, process.env.HOST);
    server.on('request', function(req, res)
    {
        var pathname = url.parse(req.url).pathname,
            pathInfo = null;

        if (typeof pathname != 'string')
        {
            // Go to catch all
        }
        else if (pathname == '/crossdomain.xml')
        {
            options.log('debug', 'Sending policy file');
            res.writeHead(200, {'Content-Type': 'application/xml'});
            return res.end(policyFile);
        }
        else if ((pathInfo = pathname.match(path2ns)))
        {
            var namespace = pathInfo[1],
                uuid = options.uuid ? pathInfo[2] : null;

            if (res.socket && req.headers.accept && req.headers.accept.indexOf('text/event-stream') != -1)
            {
                res.writeHead(200,
                {
                    'Content-Type': 'text/event-stream',
                    'Cache-Control': 'no-cache',
                    'Access-Control-Allow-Origin': '*',
                    'Connection': 'close'
                });

                req.connection.setNoDelay(true);
                self.join(namespace, res, uuid);

                if (options.max_conn_duration > 0)
                {
                    // Force end of the connection if maximum duration is reached
                    setTimeout(function() {res.end();}, options.max_conn_duration * 1000);
                }
                return;
            }
            else
            {
                self.exclude(uuid);
            }
        }

        // TODO: reimplement subscriptions

        // Catch all
        res.writeHead(200,
        {
            'Content-Length': '0',
            'Connection': 'close'
        });
        res.end();
    });

    options.log('debug', 'Worker started');
}

Worker.prototype.exclude = function(uuid, broadcast)
{
    if (!uuid) return;
    var formerClient = this.clientRegistry[uuid];
    if (formerClient) formerClient.end('retry: -1\n\n');
    if (broadcast !== false)
    {
        process.send({cmd: 'exclude', uuid: uuid});
    }
};

Worker.prototype.notify = function(namespace, total)
{
    var subscribers = this.groups.get(namespace, false);
    if (subscribers) subscribers.notify(total);
};

Worker.prototype.join = function(namespace, client, uuid)
{
    var self = this;
    // Subscribe
    this.groups.get(namespace).addClient(client);
    // Increment namespace counter on master (after a configured delay to mitigate +/- flood)
    client.incrementTimeout = setTimeout(function()
    {
        process.send({cmd: 'join', namespace: namespace});
        delete client.incrementTimeout;
    }, this.options.increment_delay * 1000);
    // Decrement on exit
    client.socket.on('close', function()
    {
        // Notify about the decrement only if the increment happended
        if ('incrementTimeout' in client)
        {
            clearTimeout(client.incrementTimeout);
        }
        else
        {
            process.send({cmd: 'leave', namespace: namespace});
        }

        if (uuid && self.clientRegistry[uuid] == client)
        {
            delete self.clientRegistry[uuid];
        }
    });
    // If uuid is provided, ensure only one client with same uuid is connected to this namespace
    if (uuid)
    {
        this.exclude(uuid);
        this.clientRegistry[uuid] = client;
    }
};

Worker.prototype.subscribe = function(namespaces, client)
{
    if (!util.isArray(namespaces))
    {
        // array required
        return;
    }

    // Subscribe to a list of namespaces
    namespaces.forEach(function(namespace)
    {
        if (typeof namespace != 'string')
        {
            // array of string required
            return;
        }

        if (namespace)
        {
            this.groups.get(namespace).addClient(client);
        }
    });
};
