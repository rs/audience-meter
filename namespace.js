var util = require('util'),
    events = require('events');

function Namespace(name, options)
{
    if (!(this instanceof Namespace)) return new Namespace(name, options);

    this.name = name;
    this.lastTotal = 0;

    this.options =
    {
        log: function(severity, message) {console.log(message);}
    };

    for (var opt in options)
    {
        if (options.hasOwnProperty(opt))
        {
            this.options[opt] = options[opt];
        }
    }

    this.log = this.options.log;
    this.setMaxListeners(0);
}

util.inherits(Namespace, events.EventEmitter);

module.exports.Namespace = Namespace;

Namespace.prototype.notify = function(total)
{
    this.lastTotal = total;

    if (total === 0)
    {
        this.emit('empty');
    }
    else
    {
        this.emit('total', total);
    }
};

Namespace.prototype.join = function(client)
{
    var self = this;

    function notify(total)
    {
        client.write(JSON.stringify({name: self.name, total: total}));
    }
    notify(this.lastTotal + 1);

    this.on('total', notify);

    client.on('close', function()
    {
        self.removeListener('total', notify);
        self.log('debug', 'Client `' + client.id + '\' unsubscribed from namespace: ' + self.name);
    });

    this.log('debug', 'Client `' + client.id + '\' subscribed to namespace: ' + self.name);
};


function NamespaceCollection(options)
{
    if (!(this instanceof NamespaceCollection)) return new NamespaceCollection(options);

    this.namespaces = {};
    this.options =
    {
        log: function(severity, message) {console.log(message);}
    };

    for (var opt in options)
    {
        if (options.hasOwnProperty(opt))
        {
            this.options[opt] = options[opt];
        }
    }

    this.log = this.options.log;
}

module.exports.NamespaceCollection = NamespaceCollection;

NamespaceCollection.prototype.get = function(name, auto_create)
{
    var namespace = this.namespaces[name];
    if (!namespace && auto_create !== false)
    {
        this.log('debug', 'Create `' + name + '\' namespace');
        this.namespaces[name] = namespace = new Namespace(name, {log: this.log});
        var self = this;
        namespace.on('empty', function()
        {
            self.log('debug', 'Drop `' + name + '\' empty namespace');
            delete self.namespaces[name];
        });
    }
    return namespace;
};