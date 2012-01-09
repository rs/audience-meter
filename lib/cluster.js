var dgram = require('dgram'),
    util = require('util'),
    uuid = require('node-uuid'),
    merge = require('./utils').merge;

exports.ClusterManager = ClusterManager;

function ClusterManager(options)
{
    if (!(this instanceof ClusterManager)) return new ClusterManager(options);

    this.options = merge
    ({
        multicast_addr: '239.255.13.37:314',
        notify_interval: 2,
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
        self.parseMessage(message);
    });

    setInterval(function() {self.checkNamespaces();}, this.options.timeout * 1000);
    setInterval(function() {self.advertise();}, this.options.notify_interval * 1000);
}

ClusterManager.prototype.advertise = function()
{
    var self = this;
    this.audience.eachNamespace(function(namespace)
    {
        var members = namespace.members - (namespace.remoteMembers ? namespace.remoteMembers : 0),
            connections = namespace.connections - (namespace.remoteConnections ? namespace.remoteConnections : 0),
            message = new Buffer(JSON.stringify([self.sid, namespace.name, members, connections]));

        self.log('debug', 'Cluster advertise `' + namespace.name + '\' namespace with ' + members + ' members');
        self.socket.send(message, 0, message.length, self.mcastPort, self.mcastIP);
    });
};

ClusterManager.prototype.parseMessage = function(message)
{
    var components;

    try
    {
        components = JSON.parse(message);
        if (!util.isArray(components) || components.length !== 4) throw new Error();
    }
    catch (e)
    {
        self.log('info', 'Receive invalid multicast message: ' + message);
        return;
    }

    var sid = components[0],
        name = components[1],
        members = components[2],
        connections = components[3],
        membersDelta,
        connectionsDelta;

    // Ignore own messages
    if (sid == this.sid) return;

    var key = sid + ':' + name;
    var info = this.namespacesInfo[key];

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

    this.updateNamespace(name, membersDelta, connectionsDelta);
};

ClusterManager.prototype.updateNamespace = function(name, membersDelta, connectionsDelta)
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
            this.updateNamespace(info.name, -info.members, -info.connections);
            delete this.namespacesInfo[key];
        }
    }
};