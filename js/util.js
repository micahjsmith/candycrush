// String format snippet
// From SO user fearphage (http://stackoverflow.com/a/4673436/2514228)
if (!String.prototype.format) {
  String.prototype.format = function() {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function(match, number) { 
      return typeof args[number] != 'undefined'
        ? args[number]
        : match
      ;
    });
  };
}

// A short jQuery extension to read query parameters from the URL.
$.extend({
  getUrlVars: function() {
    var vars = [], pair;
    var pairs = window.location.search.substr(1).split("&");
    for (var i = 0; i < pairs.length; i++) {
      pair = pairs[i].split("=");
      vars.push(pair[0]);
      vars[pair[0]] = pair[1] &&
          decodeURIComponent(pair[1].replace(/\+/g, " "));
    }
    return vars;
  },
  getUrlVar: function(name) {
    return $.getUrlVars()[name];
  }
});

