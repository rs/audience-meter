var util = require('util'),
    events = require('events'),
    merge = require('./utils').merge;

util.inherits(Audience, events.EventEmitter);
exports.Audience = Audience;

function Audience(options)
{
    if (!(this instanceof Audience)) return new Audience(options);

    this.namespaces = {};
    this.options = merge
    ({
        notify_delta_ratio: 0.1,
        notify_min_delay: 2,
        notify_max_delay: 25,
        namespace_clean_delay: 60,
        log: function(severity, message) {console.log(message);}
    }, options);

    var self = this;
    setInterval(function() {self.notifyAll();}, this.options.notify_min_delay * 1000);
    this.log = this.options.log;
}

Audience.prototype.eachNamespace = function(cb)
{
    for (var key in this.namespaces)
    {
        if (!this.namespaces.hasOwnProperty(key)) continue;
        cb(this.namespaces[key]);
    }
};

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
            }
        };
        this.namespaces['@' + name] = namespace;

        this.log('debug', 'Create `' + namespace.name + '\' namespace');
    }

    return namespace;
};

Audience.prototype.cleanNamespace = function(namespace)
{
    if (namespace.members === 0 && !namespace.garbageTimer)
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

Audience.prototype.join = function(namespaceName)
{
    var self = this,
        namespace = this.namespace(namespaceName);

    if (!namespace) throw new Error('Invalid Namespace');

    namespace.members++;
    namespace.connections++;

    this.log('debug', 'Join `' + namespace.name + '\' namespace: #' + namespace.members);
};

Audience.prototype.leave = function(namespaceName)
{
    var namespace = this.namespace(namespaceName);
    if (!namespace) return;
    namespace.members--;

    this.log('debug', 'Leave `' + namespace.name + '\' namespace: #' + namespace.members);
};

Audience.prototype.notifyAll = function()
{
    for (var key in this.namespaces)
    {
        if (!this.namespaces.hasOwnProperty(key)) continue;

        var namespace = this.namespaces[key];
        if (namespace.members === 0)
        {
            this.cleanNamespace(namespace);
            continue;
        }

        if (Math.round(new Date().getTime() / 1000) - namespace.last.timestamp < this.options.notify_max_delay)
        {
            minDelta = Math.max(Math.floor(namespace.last.members * this.options.notify_delta_ratio), 1);

            if (Math.abs(namespace.last.members - namespace.members) < minDelta)
            {
                // Only notify if total members significantly changed since the last notice
                continue;
            }
        }

        namespace.last = {members: namespace.members, timestamp: Math.round(new Date().getTime() / 1000)};

        this.log('debug', 'Notify `' + namespace.name + '\' namespace with ' + namespace.members + ' members');

        this.emit('notify', namespace);
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
            connections: namespace.connections,
            modified: namespace.last.timestamp
        };
    }

    return stats;
};
