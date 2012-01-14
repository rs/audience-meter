var events = require('events'),
    url = require('url'),
    http = require('http'),
    merge = require('./utils').merge;

exports.Worker = Worker;

function Worker(options)
{
    if (!(this instanceof Worker)) return new Worker(options);

    options = merge
    ({
        sockjs_client_url: null,
        log: function(severity, message) {console.log(message);}
    }, options);

    var sockjsOptions =
    {
        jsessionid: false,
        log: options.log
    };
    if (options.sockjs_client_url)
    {
        sockjsOptions.sockjs_url = options.sockjs_client_url;
    }

    this.groups = require('./subscribers').SubscribersGroup({log: options.log});

    var self =  this;
    process.on('message', function(msg)
    {
        if (msg.cmd == 'notify')
        {
            self.notify(msg.namespace, msg.total);
        }
    });

    var policyFile = '<?xml version="1.0"?>' +
                     '<!DOCTYPE cross-domain-policy SYSTEM "http://www.macromedia.com/xml/dtds/cross-domain-policy.dtd">' +
                     '<cross-domain-policy>' +
                     '<site-control permitted-cross-domain-policies="master-only"/>' +
                     '<allow-access-from domain="*" secure="false"/>' +
                     '</cross-domain-policy>';

    var server = http.Server();
    server.listen(80);
    server.on('request', function(req, res)
    {
        var pathname = url.parse(req.url).pathname;

        if (typeof pathname != 'string')
        {
            return res.end();
        }
        else if (pathname == '/crossdomain.xml')
        {
            options.log('debug', 'Sending policy file');
            res.writeHead(200, {'Content-Type': 'application/xml'});
            res.end(policyFile);
        }
        else
        {
            res.writeHead(200,
            {
                'Content-Type': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Access-Control-Allow-Origin': '*',
                'Connection': 'keep-alive'
            });

            var namespace = pathname.replace(/^\/|\/.*/g, '');
            if (namespace && parseInt(namespace, 10) != namespace) // namespace can't be a number or empty string
            {
                self.join(namespace, res);
            }
        }
        // TODO: reimplement subscriptions
    });

    options.log('debug', 'Worker started');
}

Worker.prototype.notify = function(namespace, total)
{
    var subscribers = this.groups.get(namespace, false);
    if (subscribers) subscribers.notify(total);
};

Worker.prototype.join = function(namespace, client)
{
    // Subscribe
    this.groups.get(namespace).addClient(client);
    // Increment namespace counter on master
    process.send({cmd: 'join', namespace: namespace});
    // Decrement on exit
    client.socket.on('close', function()
    {
        process.send({cmd: 'leave', namespace: namespace});
    });
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
