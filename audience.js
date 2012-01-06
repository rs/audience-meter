var util = require('util');

module.exports.createInstance = function(options)
{
    return new Audience(options);
};

function Audience(options)
{
    this.namespaces = {};
    this.options =
    {
        notify_delta_ratio: 0.1,
        notify_min_delay: 2,
        notify_max_delay: 60,
        namespace_clean_delay: 60,
        log: function(severity, message) {console.log(message);}
    };

    for (var name in options)
    {
        if (options.hasOwnProperty(name))
        {
            this.options[name] = options[name];
        }
    }

    var self = this;
    setInterval(function() {self.notifyAll();}, this.options.notify_min_delay * 1000);
    this.log = this.options.log;
}

Audience.prototype.namespace = function(name, auto_create)
{
    if (!name) return;

    var namespace = this.namespaces['@' + name];

    if (namespace && namespace.garbageTimer)
    {
        clearTimeout(namespace.garbageTimer);
        delete namespace.garbageTimer;
    }

    if (!namespace && auto_create !== false)
    {
        namespace =
        {
            name: name,
            created: Math.round(new Date().getTime() / 1000),
            connections: 0,
            members: 0,
            last:
            {
                members: 0,
                timestamp: 0
            },
            clients: {}
        };
        this.namespaces['@' + name] = namespace;

        this.log('debug', 'Create `' + namespace.name + '\' namespace');
    }

    return namespace;
};

Audience.prototype.cleanNamespace = function(namespace)
{
    if (namespace.clients.length === 0 && !namespace.garbageTimer)
    {
        var self = this;
        this.log('debug', 'Schedule delete of `' + namespace.name + '\' namespace');

        namespace.garbageTimer = setTimeout(function()
        {
            self.log('debug', 'Delete `' + namespace.name + '\' namespace');
            delete self.namespaces[namespace.name];
        }, this.options.namespace_clean_delay * 1000);
    }
};

Audience.prototype.join = function(client, namespaceName)
{
    var self = this,
        namespace = this.namespace(namespaceName);

    if (!namespace) throw new Error('Invalid Namespace');

    namespace.members++;
    namespace.connections++;
    namespace.clients[client.id] = client;

    this.notify(namespace, client);

    client.once('close', function()
    {
        self.leave(this, namespaceName);
    });

    this.log('debug', 'Client `' + client.id + '\' joined `' + namespace.name + '\' namespace');
};

Audience.prototype.leave = function(client, namespaceName)
{
    var namespace = this.namespace(namespaceName);

    if (!namespace) return;
    if (!namespace.clients[client.id]) return;

    namespace.members--;
    delete namespace.clients[client.id];

    this.log('debug', 'Client `' + client.id + '\' leaved `' + namespace.name + '\' namespace');
};

Audience.prototype.subscribe = function(client, namespaces)
{
    if (!util.isArray(namespaces))
    {
        throw new Error('Array required');
    }

    namespaces.forEach(function(namespaceName)
    {
        if (typeof namespaceName != 'string')
        {
            throw new Error('Array of strings required');
        }
    });

    var self = this;

    client.namespaces = [];

    namespaces.forEach(function(namespaceName)
    {
        var namespace = self.namespace(namespaceName);
        if (!namespace.clients[client.id])
        {
            namespace.clients[client.id] = client;
            client.namespaces.push(namespace.name);
        }
    });

    this.log('debug', 'Client `' + client.id + '\' subscribed to namespaces: ' + namespaces.join(', '));

    client.once('close', function()
    {
        self.unsubscribeNamespaces(this);
    });
};

Audience.prototype.unsubscribeNamespaces = function(client)
{
    var self = this;
    if (!client.namespaces) return;
    client.namespaces.forEach(function(namespaceName)
    {
        var namespace = self.namespace(namespaceName);
        delete namespace.clients[client.id];
    });
    this.log('debug', 'Client `' + client.id + '\' unsubscribed from namespaces: ' + namespaces.join(', '));
    delete client.namespaces;
};

Audience.prototype.notify = function(namespace, client)
{
    if (client)
    {
        client.write(JSON.stringify({name: namespace.name, total: namespace.members}));
    }
    else
    {
        this.log('debug', 'Notify `' + namespace.name + '\' namespace: ' + namespace.members);

        for (var id in namespace.clients)
        {
            if (!namespace.clients.hasOwnProperty(id)) continue;
            this.notify(namespace, namespace.clients[id]);
        }
    }
};

Audience.prototype.notifyAll = function()
{
    this.log('debug', 'Notify all namespaces');

    for (var key in this.namespaces)
    {
        if (!this.namespaces.hasOwnProperty(key)) continue;

        var namespace = this.namespaces[key],
            minDelta = 1;

        if (namespace.clients.length === 0)
        {
            this.cleanNamespace(namespace);
            continue;
        }

        if (Math.round(new Date().getTime() / 1000) - namespace.last.timestamp < this.options.notify_max_delay)
        {
            minDelta = Math.max(Math.floor(namespace.last.members * this.options.notify_delta_ratio), 1);
        }

        if (Math.abs(namespace.last.members - namespace.members) < minDelta)
        {
            // Only notify if total members significantly changed since the last notice
            continue;
        }

        namespace.last = {members: namespace.members, timestamp: Math.round(new Date().getTime() / 1000)};
        this.notify(namespace);
    }
};

Audience.prototype.info = function(namespaceName)
{
    var namespace = this.namespace(namespaceName, false);
    return namespace ? namespace.members + ':' + namespace.connections : '0:0';
};

Audience.prototype.stats = function()
{
    var stats = {};
    for (var key in this.namespaces)
    {
        if (!this.namespaces.hasOwnProperty(key)) continue;

        var namespace = this.namespaces[key];
        stats[namespace.name] =
        {
            created: namespace.created,
            members: namespace.members,
            connections: namespace.connections
        };
    }

    return stats;
};