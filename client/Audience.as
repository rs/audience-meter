package
{
    import flash.display.LoaderInfo;
    import flash.display.Sprite;
    import flash.external.ExternalInterface;
    import flash.net.URLStream;
    import flash.events.Event;
    import flash.events.ProgressEvent;
    import flash.events.IOErrorEvent;
    import flash.net.URLRequest;
    import flash.net.URLRequestHeader;
    import flash.net.URLRequestMethod;
    import flash.utils.setTimeout;

    public dynamic class Audience extends Sprite
    {
        private var offset:Number;
        private var stream:URLStream;
        private var callback:String;
        private var request:URLRequest;

        public function Audience():void
        {
            var params:Object = LoaderInfo(this.root.loaderInfo).parameters;
            var url:String = String(params['url']);
            this.callback = String(params['callback']);

            this.request = new URLRequest(url);
            this.request.method = URLRequestMethod.POST;
            this.request.requestHeaders = new Array(new URLRequestHeader('Accept','text/event-stream'));
            this.request.data = 0;

            this.stream = new URLStream();
            this.stream.addEventListener(ProgressEvent.PROGRESS, this.dataReceived);
            this.stream.addEventListener(Event.COMPLETE, this.reconnect);
            this.stream.addEventListener(IOErrorEvent.IO_ERROR, this.reconnect);

            this.connect();
        }

        private function connect():void
        {
            this.offset = 0;
            this.stream.load(this.request);
        }

        private function reconnect(e:Event):void
        {
            setTimeout(this.connect, 2000);
        }

        public function dataReceived(e:ProgressEvent):void
        {
            var buffer:String = stream.readUTFBytes(e.bytesLoaded - this.offset);
            this.offset = e.bytesLoaded;
            if (!buffer) return;

            var lines:Array = buffer.split('\n');
            for (var i:int = 0, l:int = lines.length; i < l; i++)
            {
                var line:String = lines[i];
                line = line.replace(/^data:\s+|[\s\n]+$/g, '');
                if (line)
                {
                    ExternalInterface.call(this.callback, line);
                }
            }
        }
    }
}