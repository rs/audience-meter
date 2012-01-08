exports.merge = function()
{
    var result = {};

    Array.prototype.forEach.call(arguments, function(obj)
    {
        for (var name in obj)
        {
            if (obj.hasOwnProperty(name))
            {
                result[name] = obj[name];
            }
        }
    });

    return result;
};