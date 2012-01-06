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
        namespace_clean_delay: 60
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
    }

    return namespace;
};

Audience.prototype.cleanNamespace = function(namespace)
{
    if (namespace.members === 0)
    {
        var self = this;
        namespace.garbageTimer = setTimeout(function()
        {
            delete self.namespaces[namespace.name];
        }, namespace_clean_delay * 1000);
    }
};

Audience.prototype.join = function(client)
{
    var self = this,
        namespace = this.namespace(client.pathname.replace(/^\/|\/.*/g, ''));

    if (!namespace) return;

    namespace.members++;
    namespace.connections++;
    namespace.clients[client.id] = client;

    self.notify(namespace, client);

    client.once('close', function()
    {
        namespace.members--;
        delete namespace.clients[client.id];
        self.cleanNamespace(namespace);
    });
};

Audience.prototype.notify = function(namespace, client)
{
    if (client)
    {
        client.write(JSON.stringify({name: namespace.name, total: namespace.members}));
    }
    else
    {
        for (var id in namespace.clients)
        {
            if (!namespace.clients.hasOwnProperty(id)) continue;
            this.notify(namespace, namespace.clients[id]);
        }
    }
};

Audience.prototype.notifyAll = function()
{
    for (var key in this.namespaces)
    {
        if (!this.namespaces.hasOwnProperty(key)) return;

        var namespace = this.namespaces[key],
            minDelta = 1;

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
        if (!this.namespaces.hasOwnProperty(key)) return;

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