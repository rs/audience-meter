var dgram = require('dgram'),
    util = require('util'),
    uuid = require('node-uuid'),
    merge = require('./utils').merge,
    msgpack = require('msgpack');

exports.ClusterManager = ClusterManager;

function ClusterManager(options)
{
    if (!(this instanceof ClusterManager)) return new ClusterManager(options);

    this.options = merge
    ({
        multicast_addr: '239.255.13.37:314',
        notify_interval: 2,
        notify_max_items: 100,
        timeout: 5,
        audience: null,
        log: function(severity, message) {console.log(message);}
    }, options);

    this.sid = uuid.v4();
    this.audience = this.options.audience;
    this.log = this.options.log;
    this.namespacesInfo = {};

    var self = this;
    this.mcastIP = this.options.multicast_addr.split(':')[0];
    this.mcastPort = this.options.multicast_addr.split(':')[1];
    this.log('debug', 'Cluster started on ' + this.mcastIP + ':' + this.mcastPort);

    this.socket = dgram.createSocket("udp4");
    this.socket.bind(this.mcastPort);
    try
    {
        this.socket.addMembership(this.mcastIP);
    }
    catch (e)
    {
        throw new Error('The cluster feature needs a version of node.js with UDP multicast support. ' +
                        'You may use the following fork, waiting for an upstream merge: https://github.com/rs/node/tree/multicast-broadcast');
    }
    this.socket.on('message', function(message, rinfo)
    {
        self.receiveMessage(message, rinfo);
    });

    setInterval(function() {self.checkNamespaces();}, this.options.timeout * 1000);
    setInterval(function() {self.advertise();}, this.options.notify_interval * 1000);
}

ClusterManager.prototype.advertise = function()
{
    var self = this,
        idx = 0,
        queue = [];

    function flush()
    {
        var message = msgpack.pack({sid: self.sid, vals: queue});
        self.socket.send(message, 0, message.length, self.mcastPort, self.mcastIP);
        queue = [];
    }

    this.audience.eachNamespace(function(namespace)
    {
        var members = namespace.members - (namespace.remoteMembers ? namespace.remoteMembers : 0),
            connections = namespace.connections - (namespace.remoteConnections ? namespace.remoteConnections : 0);

        self.log('debug', 'Cluster advertise `' + namespace.name + '\' namespace with ' + members + ' members');
        queue.push(namespace.name, members, connections);
        if ((++idx % self.options.notify_max_items) === 0) flush();
    });

    if (queue.length > 0) flush();
};

ClusterManager.prototype.receiveMessage = function(message, rinfo)
{
    var update;

    try
    {
        update = msgpack.unpack(message);
    }
    catch (e)
    {
        this.log('error', 'Cluster received invalid multicast message from ' + rinfo.address + ':' + rinfo.port);
        return;
    }

    var err;
    if (typeof update.sid != 'string') err = 'no sid';
    else if (!update.vals || !util.isArray(update.vals)) err = 'no vals array';
    else if (update.vals % 3 !== 0) error = 'invalid vals count';
    if (err)
    {
        this.log('error', 'Cluster received invalid multicast message from ' + rinfo.address + ':' + rinfo.port + ': ' + err);
        return;
    }

    // Ignore self messages
    if (update.sid == this.sid) return;

    for (var i = 0, max = update.vals.length; i < max; i += 3)
    {
        this.updateRemoteNamespace(update.sid, update.vals[i], update.vals[i + 1], update.vals[i + 2]);
    }
};

ClusterManager.prototype.updateRemoteNamespace = function(sid, name, members, connections)
{
    var err;
    if (typeof name != 'string') err = 'namespace name is not a string: ' + name;
    else if (parseInt(members, 10) != members || members < 0) err = 'members is not a positive integer: ' + members;
    else if (parseInt(connections, 10) != connections || connections < 0) err = 'connections is not a positive integer: ' + connections;
    if (err)
    {
        this.log('error', 'Cluster received invalid update from `' + sid + '\': ' + err);
        return;
    }

    // Ignore self messages
    if (sid == this.sid) return;

    var key = sid + ':' + name;
    var info = this.namespacesInfo[key];
    var membersDelta, connectionsDelta;

    if (info)
    {
        membersDelta = members - info.members;
        connectionsDelta = connections - info.connections;
        info.members = members;
        info.connections = connections;
    }
    else
    {
        membersDelta = members;
        connectionsDelta = connections;
        this.namespacesInfo[key] =
        {
            sid: sid,
            name: name,
            members: members,
            connections: connections
        };
    }

    this.namespacesInfo[key].lastUpdate = new Date().getTime() / 1000;

    this.log('debug', 'Cluster received update for `' + name + '\' namespace from `' + sid + '\' with ' + members + ' members');

    this.updateLocalNamespace(name, membersDelta, connectionsDelta);
};

ClusterManager.prototype.updateLocalNamespace = function(name, membersDelta, connectionsDelta)
{
    var namespace = this.audience.namespace(name);

    if (!('remoteMembers' in namespace))
    {
        namespace.remoteMembers = 0;
        namespace.remoteConnections = 0;
    }

    namespace.members -= namespace.remoteMembers;
    namespace.connections -= namespace.remoteConnections;

    namespace.remoteMembers += membersDelta;
    namespace.remoteConnections += connectionsDelta;

    namespace.members += namespace.remoteMembers;
    namespace.connections += namespace.remoteConnections;
};

ClusterManager.prototype.checkNamespaces = function()
{
    var now = new Date().getTime() / 1000;

    for (var key in this.namespacesInfo)
    {
        if (!this.namespacesInfo.hasOwnProperty(key)) continue;

        var info = this.namespacesInfo[key];
        if (now - info.lastUpdate > this.options.timeout)
        {
            this.log('debug', 'The `' + info.name + '\' namespace from `' + info.sid + ' expired');
            this.updateLocalNamespace(info.name, -info.members, -info.connections);
            delete this.namespacesInfo[key];
        }
    }
};
