Audience Meter: Lightweight daemon to mesure audience of a live event
=====================================================================

Audience Meter is a simple daemon written in [Node.js](http://nodejs.org) to mesure the number of users currently online. This can be used to mesure the audience of live events.

## Requirements

- [Node.js](http://nodejs.org)
- [Socket.IO](http://socket.io)

## Features

- Namespaces to track an unlimited number of events
- Long polling (thru [Socket.IO](http://socket.io) to report online presence, and subscribe to live counters
- Monitoring interface on a dedicated port

## How to use

Start by running the daemon on a server, root privilege is required to let the daemon listen on ports 80 and 843:

    $ sudo node audience-meter.js -d
    20 Mar 01:52:10 - socket.io ready - accepting connections

In the webpage of the event, add the following javascript:

    <script src="http://{hostname}/socket.io/socket.io.js"></script>
    <script>
    var socket = new io.Socket("{hostname}");
    socket.connect();
    socket.on("connect", function()
    {
        socket.send(JSON.stringify({join: "{event_name}"}));
    });
    </script>

You may want to report the current number of online users on the event. To do that, you have to listen for the event you joined:

    <script src="http://{hostname}/socket.io/socket.io.js"></script>
    <script>
    var socket = new io.Socket("{hostname}");
    socket.connect();
    socket.on("connect", function()
    {
        socket.send(JSON.stringify({join: "{event_name}", listen: ["{event_name}"]}));
    });
    socket.on("message", function(data)
    {
        document.getElementById("total").innerHTML = data["{event_name}"];
    });
    </script>
    
    Connected users <span id="total">-</span>


You can listen for several different events at the same time, for intance to show the number of online users on an event list. All counters will be updated in real time:

    <script src="http://{hostname}/socket.io/socket.io.js"></script>
    <script>
    var socket = new io.Socket("{hostname}");
    socket.connect();
    socket.on("connect", function()
    {
        socket.send(JSON.stringify({listen: ["event1", "event2", "event3"]}));
    });
    socket.on("message", function(data)
    {
        data.forEach(function(event)
        {
            document.getElementById(event + "_total").innerHTML = data[event];
        }
    });
    </script>

    <ul>
      <li>Event 1: <span id="event1_total">-</span> users
      <li>Event 2: <span id="event2_total">-</span> users
      <li>Event 3: <span id="event3_total">-</span> users
    </ul>

## Monitoring Interface

The daemon listen on the 1442 port on localhost in order to let another process to dump all namespace counters for monitoring or graphing purpose. One possible usage is to update RRD files to track the evolution of the audiance over time.

The server send all namespaces and their associated counters separated by colon, one by line and then close the connection immediately.

Here is a usage example using netcat:

    $ nc localhost 1442
    namespace1:123
    namespace2:345
    namespace3:678
    ...

## License

(The MIT License)

Copyright (c) 2011 Olivier Poitrey <rs@dailymotion.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the 'Software'), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED 'AS IS', WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

