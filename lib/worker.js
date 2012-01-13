var events = require('events'),
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

    var sockjs = require('sockjs').createServer(sockjsOptions);
    sockjs.installHandlers(http.Server().listen(80), {prefix: '\/?[^/]*'});
    sockjs.on('connection', function(client)
    {
        var namespace = client.pathname.replace(/^\/|\/.*/g, '');
        if (namespace && parseInt(namespace, 10) != namespace) // namespace can't be a number or empty string
        {
            self.join(namespace, client);
        }

        client.on('data', function(message)
        {
            try
            {
                self.subscribe(JSON.parse(message), this);
            }
            catch (e)
            {
                options.log('error', 'Cannot parse: ' + message);
            }
        });
    });
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
    client.on('close', function()
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
