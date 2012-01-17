(function($, global)
{
    $.extend($.ajaxSettings.accepts, {stream: "text/event-stream"});

    function openXHRConnection(url, deferred)
    {
        var offset = 0,
            xhr = global.XDomainRequest ? new global.XDomainRequest() : new global.XMLHttpRequest();
        xhr.open('POST', url, true);
        xhr.withCredentials = false;
        xhr.setRequestHeader('Accept', 'text/event-stream');
        $(xhr).bind('error abort load', function()
        {
            setTimeout(function() {openConnection(url, deferred);}, 2000);
        });
        $(xhr).bind('progress', function()
        {
            while (true)
            {
                var nextOffset = this.responseText.indexOf('\n\n', offset);
                if (nextOffset === -1) break;
                var data = this.responseText.substring(offset, nextOffset);
                offset = nextOffset + 2;

                var lines = data.split('\n');
                for (var i = 0, l = lines.length; i < l; i++)
                {
                    var line = lines[i].replace(/^data:\s+|[\s\n]+$/g, '');
                    deferred.notify(line);
                }
            }
        });
        deferred.done(function()
        {
            $(xhr).unbind();
            xhr.abort();
        });
        xhr.send();
    }

    function openFlashConnection(url, deferred)
    {
        var flashObject = null,
            callback = 'audience' + new Date().getTime();

        global[callback] = function(data)
        {
            deferred.notify(data);
        };

        if (navigator.plugins && navigator.mimeTypes && navigator.mimeTypes.length) // Netscape plugin architecture
        {
            flashObject = $('<embed>').attr
            ({
                type: 'application/x-shockwave-flash',
                src: '/client/audience.swf', // TODO make this customizable
                allowScriptAccess: 'always',
                flashvars: 'callback=' + callback + '&url=' + encodeURI(url),
                width: '0',
                height: '0'
            });
        }
        else // IE
        {
            flashObject =
            $(
                '<object id="iframe-embed" classid="clsid:D27CDB6E-AE6D-11cf-96B8-444553540000" width="0" height="0">' +
                    '<param name="movie" value="/client/audience.swf"></param>' + // TODO make this customizable
                    '<param name="flashvars" value="callback=' + callback + '&url=' + encodeURI(url) + '"></param>' +
                    '<param name="allowScriptAccess" value="always"></param>' +
                '</object>'
            );
        }

        flashObject.appendTo(document.body);

        deferred.done(function()
        {
            flashObject.remove();
        });
    }

    $.audience = function(url)
    {
        var deferred = $.Deferred();
        if ($.support.cors)
        {
            // setTimeout to schedule the connection in the next tick in order prevent infinit loading
            setTimeout(function() {openXHRConnection(url, deferred);}, 0);
        }
        else
        {
            openFlashConnection(url, deferred);
        }
        var promise = deferred.promise();
        promise.close = function()
        {
            deferred.resolve();
        };
        return promise;
    };

})(jQuery, this);
