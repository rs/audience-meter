Audience Meter: Lightweight daemon to mesure audience of a live event
=====================================================================

Audience Meter is a simple daemon written in [Node.js](http://nodejs.org) to mesure the number of users currently online. This can be used to mesure the audience of live events.

## Requirements

- [Node.js](http://nodejs.org)
- [Sockjs](http://sockjs.org)

## Features

- Namespaces to track an unlimited number of events
- Cross browser websocket (thru [Sockjs](http://sockjs.org) to report online presence, and subscribe to live counters
- Monitoring interface on a dedicated port
- Spreads the load on multiple CPUs and/or multiple servers

## How to use

Start by running the daemon on a server, root privilege is required to let the daemon listen on ports 80:

    $ sudo node audience-meter.js

Here are available parameters:

Usage: audience-meter.js [options]

Options:

  -h, --help                           output usage information
  -V, --version                        output the version number
  -d, --debug                          Log everything
  -w, --workers <num>                  Number of worker processes to spawn (default to the number of CPUs)
  -m, --cluster-addr <ip:port>         Use a given multicast IP:PORT to sync several instances of audience-meter
                                       (disabled by default, prefered address is 239.255.13.37:314)
  --cluster-notify-interval <seconds>  Interval between notifications for a node's notification (default 2 seconds
  --cluster-node-timeout <seconds>     Delay after which node's namespace info will be forgotten if no notificationis
                                       recieved by a node (default 5 seconds)
  --sockjs-url                         URL to the sockjs client library (default is sockjs CDN hosted lib)
  --notify-delta-ratio <ratio>         Minimum delta of number of members to reach before to notify listeners based
                                       on a fraction of the current number of members (default 0.1)
  --notify-min-delay <seconds>         Minimum delay between notifications (default 2)
  --notify-max-delay <seconds>         Maximum delay to wait before not sending notification because of min-delta not
                                       reached (default 60)
  --namespace-clean-delay <seconds>    Minimum delay to wait before to clean an empty namespace (default 60)
  --demo-port <port>                   Public port on which to bind the demo server (default 8080, 0 to disable)
  --stats-port <port>                  Local port on which to bind the global stats server (default 1442, 0 to disable)


In the webpage of the event, add the following javascript to join an event.:

    <script src="http://cdn.sockjs.org/sockjs-0.1.min.js"></script>
    <script>
    function connect(namespace)
    {
        var sock = new SockJS('http://YOUR-SERVER.COM/' + namespace);
        // Auto-reconnect
        sock.onclose = function() {setTimeout(function() {connect(namespace)}, 2000);}
    }
    connect("{event_name}");
    </script>

Note that you can only join a single event at a time in a single page.

You may want to report the current number of online users on the event. By default, joining an event listen for it. To get event members count when it changes, listen for incoming messages like this:

    <script src="http://cdn.sockjs.org/sockjs-0.1.min.js"></script>
    <script>
    function connect(namespace)
    {
        var sock = new SockJS('http://YOUR-SERVER.COM/' + namespace);
        // Auto-reconnect
        sock.onclose = function() {setTimeout(function() {connect(namespace)}, 2000);}

        sock.onmessage = function(e)
        {
            var info = JSON.parse(e.data);
            document.getElementById("total").innerHTML = info.total;
        };
    }
    connect("{event_name}");
    </script>
    
    Connected users <span id="total">-</span>


You can listen for several different events at the same time, for intance to show the number of online users on an event list. All counters will be updated in real time:

    <script src="http://cdn.sockjs.org/sockjs-0.1.min.js"></script>
    <script>
    function connect()
    {
        // Connecting to /lobby won't join a namespace
        var sock = new SockJS('http://YOUR-SERVER.COM/lobby');
        // Auto-reconnect
        sock.onclose = function() {setTimeout(function() {connect()}, 2000);}

        sock.onopen = function(e)
        {
            // Sets the list of events to subscribe to
            sock.write(JSON.stringify(["event1", "event2", "event3"]));
        };

        sock.onmessage = function(e)
        {
            var info = JSON.parse(e.data);
            document.getElementById(info.name + "_total").innerHTML = info.total;
        };
    }
    connect();
    </script>

    <ul>
      <li>Event 1: <span id="event1_total">-</span> users
      <li>Event 2: <span id="event2_total">-</span> users
      <li>Event 3: <span id="event3_total">-</span> users
    </ul>

## Monitoring Interface

The daemon listen on the 1442 port on localhost in order to let another process to dump all namespace counters for monitoring or graphing purpose. One possible usage is to update RRD files to track the evolution of the audiance over time.

The server send all namespaces and their associated info separated formated as a JSON object. Each namespace is stored in a proprety, with an object containing info on the namespace. Namespace fields are:

* *created*: the UNIX timestamp of the namespace creationg time
* *connections*: the total number of connections to the namespace since its creation
* *members*: the current number of participents in the namespace

Here is a usage example using netcat (indentation added for clarity):

    $ nc localhost 1442
    {
        "namespace1":
        {
            "created":1300804962,
            "connections":234,
            "members":123
        },
        "namespace2":
        {
            "created":1300804302,
            "connections":456,
            "members":345
        },
        "namespace3":
        {
            "created":1300824940,
            "connections":789,
            "members":678
        }
    }

## License

(The MIT License)

Copyright (c) 2011 Olivier Poitrey <rs@dailymotion.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

