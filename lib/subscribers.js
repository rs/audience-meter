var util = require('util'),
    events = require('events');

util.inherits(Subscribers, events.EventEmitter);
exports.Subscribers = Subscribers;

function Subscribers()
{
    if (!(this instanceof Subscribers)) return new Subscribers();

    this.lastTotal = 0;
    this.setMaxListeners(0);
}

Subscribers.prototype.createNotifyMessage = function(total)
{
    return JSON.stringify({name: this.name, total: total});
};

Subscribers.prototype.notify = function(total)
{
    this.lastTotal = total;

    if (total === 0)
    {
        this.emit('empty');
    }
    else
    {
        this.emit('notify', this.createNotifyMessage(total));
    }
};

Subscribers.prototype.addClient = function(client)
{
    var self = this;

    function notify(data) {client.write(data);}
    client.write(this.createNotifyMessage(this.lastTotal + 1));

    this.on('notify', notify);

    client.on('close', function()
    {
        self.removeListener('notify', notify);
        self.emit('remove', this);
    });

    this.emit('add', client);
};


function SubscribersGroup(options)
{
    if (!(this instanceof SubscribersGroup)) return new SubscribersGroup(options);

    this.groups = {};
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

module.exports.SubscribersGroup = SubscribersGroup;

SubscribersGroup.prototype.get = function(name, auto_create)
{
    var subscribers = this.groups[name];
    if (!subscribers && auto_create !== false)
    {
        this.log('debug', 'Create `' + name + '\' subscribers group');
        this.groups[name] = subscribers = new Subscribers();

        var self = this;
        subscribers.on('empty', function()
        {
            self.log('debug', 'Drop `' + name + '\' empty subscribers group');
            delete self.groups[name];
        });
        subscribers.on('add', function(client)
        {
            self.log('debug', 'Client `' + client.id + '\' subscribed to `' + name + '\'');
        });
        subscribers.on('remove', function(client)
        {
            self.log('debug', 'Client `' + client.id + '\' unsubscribed from `' + name + '\'');
        });
    }
    return subscribers;
};