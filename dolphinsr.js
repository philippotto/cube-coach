/* eslint-disable */
(function(){function r(e,n,t){function o(i,f){if(!n[i]){if(!e[i]){var c="function"==typeof require&&require;if(!f&&c)return c(i,!0);if(u)return u(i,!0);var a=new Error("Cannot find module '"+i+"'");throw a.code="MODULE_NOT_FOUND",a}var p=n[i]={exports:{}};e[i][0].call(p.exports,function(r){var n=e[i][1][r];return o(n||r)},p,p.exports,r,e,n,t)}return n[i].exports}for(var u="function"==typeof require&&require,i=0;i<t.length;i++)o(t[i]);return o}return r})()({1:[function(require,module,exports){
window.dolphinsr = require("dolphinsr");

},{"dolphinsr":4}],2:[function(require,module,exports){
(function (process){
/**
 * This is the web browser implementation of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = require('./debug');
exports.log = log;
exports.formatArgs = formatArgs;
exports.save = save;
exports.load = load;
exports.useColors = useColors;
exports.storage = 'undefined' != typeof chrome
               && 'undefined' != typeof chrome.storage
                  ? chrome.storage.local
                  : localstorage();

/**
 * Colors.
 */

exports.colors = [
  'lightseagreen',
  'forestgreen',
  'goldenrod',
  'dodgerblue',
  'darkorchid',
  'crimson'
];

/**
 * Currently only WebKit-based Web Inspectors, Firefox >= v31,
 * and the Firebug extension (any Firefox version) are known
 * to support "%c" CSS customizations.
 *
 * TODO: add a `localStorage` variable to explicitly enable/disable colors
 */

function useColors() {
  // NB: In an Electron preload script, document will be defined but not fully
  // initialized. Since we know we're in Chrome, we'll just detect this case
  // explicitly
  if (typeof window !== 'undefined' && window.process && window.process.type === 'renderer') {
    return true;
  }

  // is webkit? http://stackoverflow.com/a/16459606/376773
  // document is undefined in react-native: https://github.com/facebook/react-native/pull/1632
  return (typeof document !== 'undefined' && document.documentElement && document.documentElement.style && document.documentElement.style.WebkitAppearance) ||
    // is firebug? http://stackoverflow.com/a/398120/376773
    (typeof window !== 'undefined' && window.console && (window.console.firebug || (window.console.exception && window.console.table))) ||
    // is firefox >= v31?
    // https://developer.mozilla.org/en-US/docs/Tools/Web_Console#Styling_messages
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/firefox\/(\d+)/) && parseInt(RegExp.$1, 10) >= 31) ||
    // double check webkit in userAgent just in case we are in a worker
    (typeof navigator !== 'undefined' && navigator.userAgent && navigator.userAgent.toLowerCase().match(/applewebkit\/(\d+)/));
}

/**
 * Map %j to `JSON.stringify()`, since no Web Inspectors do that by default.
 */

exports.formatters.j = function(v) {
  try {
    return JSON.stringify(v);
  } catch (err) {
    return '[UnexpectedJSONParseError]: ' + err.message;
  }
};


/**
 * Colorize log arguments if enabled.
 *
 * @api public
 */

function formatArgs(args) {
  var useColors = this.useColors;

  args[0] = (useColors ? '%c' : '')
    + this.namespace
    + (useColors ? ' %c' : ' ')
    + args[0]
    + (useColors ? '%c ' : ' ')
    + '+' + exports.humanize(this.diff);

  if (!useColors) return;

  var c = 'color: ' + this.color;
  args.splice(1, 0, c, 'color: inherit')

  // the final "%c" is somewhat tricky, because there could be other
  // arguments passed either before or after the %c, so we need to
  // figure out the correct index to insert the CSS into
  var index = 0;
  var lastC = 0;
  args[0].replace(/%[a-zA-Z%]/g, function(match) {
    if ('%%' === match) return;
    index++;
    if ('%c' === match) {
      // we only are interested in the *last* %c
      // (the user may have provided their own)
      lastC = index;
    }
  });

  args.splice(lastC, 0, c);
}

/**
 * Invokes `console.log()` when available.
 * No-op when `console.log` is not a "function".
 *
 * @api public
 */

function log() {
  // this hackery is required for IE8/9, where
  // the `console.log` function doesn't have 'apply'
  return 'object' === typeof console
    && console.log
    && Function.prototype.apply.call(console.log, console, arguments);
}

/**
 * Save `namespaces`.
 *
 * @param {String} namespaces
 * @api private
 */

function save(namespaces) {
  try {
    if (null == namespaces) {
      exports.storage.removeItem('debug');
    } else {
      exports.storage.debug = namespaces;
    }
  } catch(e) {}
}

/**
 * Load `namespaces`.
 *
 * @return {String} returns the previously persisted debug modes
 * @api private
 */

function load() {
  var r;
  try {
    r = exports.storage.debug;
  } catch(e) {}

  // If debug isn't set in LS, and we're in Electron, try to load $DEBUG
  if (!r && typeof process !== 'undefined' && 'env' in process) {
    r = process.env.DEBUG;
  }

  return r;
}

/**
 * Enable namespaces listed in `localStorage.debug` initially.
 */

exports.enable(load());

/**
 * Localstorage attempts to return the localstorage.
 *
 * This is necessary because safari throws
 * when a user disables cookies/localstorage
 * and you attempt to access it.
 *
 * @return {LocalStorage}
 * @api private
 */

function localstorage() {
  try {
    return window.localStorage;
  } catch (e) {}
}

}).call(this,require('_process'))
},{"./debug":3,"_process":6}],3:[function(require,module,exports){

/**
 * This is the common logic for both the Node.js and web browser
 * implementations of `debug()`.
 *
 * Expose `debug()` as the module.
 */

exports = module.exports = createDebug.debug = createDebug['default'] = createDebug;
exports.coerce = coerce;
exports.disable = disable;
exports.enable = enable;
exports.enabled = enabled;
exports.humanize = require('ms');

/**
 * The currently active debug mode names, and names to skip.
 */

exports.names = [];
exports.skips = [];

/**
 * Map of special "%n" handling functions, for the debug "format" argument.
 *
 * Valid key names are a single, lower or upper-case letter, i.e. "n" and "N".
 */

exports.formatters = {};

/**
 * Previous log timestamp.
 */

var prevTime;

/**
 * Select a color.
 * @param {String} namespace
 * @return {Number}
 * @api private
 */

function selectColor(namespace) {
  var hash = 0, i;

  for (i in namespace) {
    hash  = ((hash << 5) - hash) + namespace.charCodeAt(i);
    hash |= 0; // Convert to 32bit integer
  }

  return exports.colors[Math.abs(hash) % exports.colors.length];
}

/**
 * Create a debugger with the given `namespace`.
 *
 * @param {String} namespace
 * @return {Function}
 * @api public
 */

function createDebug(namespace) {

  function debug() {
    // disabled?
    if (!debug.enabled) return;

    var self = debug;

    // set `diff` timestamp
    var curr = +new Date();
    var ms = curr - (prevTime || curr);
    self.diff = ms;
    self.prev = prevTime;
    self.curr = curr;
    prevTime = curr;

    // turn the `arguments` into a proper Array
    var args = new Array(arguments.length);
    for (var i = 0; i < args.length; i++) {
      args[i] = arguments[i];
    }

    args[0] = exports.coerce(args[0]);

    if ('string' !== typeof args[0]) {
      // anything else let's inspect with %O
      args.unshift('%O');
    }

    // apply any `formatters` transformations
    var index = 0;
    args[0] = args[0].replace(/%([a-zA-Z%])/g, function(match, format) {
      // if we encounter an escaped % then don't increase the array index
      if (match === '%%') return match;
      index++;
      var formatter = exports.formatters[format];
      if ('function' === typeof formatter) {
        var val = args[index];
        match = formatter.call(self, val);

        // now we need to remove `args[index]` since it's inlined in the `format`
        args.splice(index, 1);
        index--;
      }
      return match;
    });

    // apply env-specific formatting (colors, etc.)
    exports.formatArgs.call(self, args);

    var logFn = debug.log || exports.log || console.log.bind(console);
    logFn.apply(self, args);
  }

  debug.namespace = namespace;
  debug.enabled = exports.enabled(namespace);
  debug.useColors = exports.useColors();
  debug.color = selectColor(namespace);

  // env-specific initialization logic for debug instances
  if ('function' === typeof exports.init) {
    exports.init(debug);
  }

  return debug;
}

/**
 * Enables a debug mode by namespaces. This can include modes
 * separated by a colon and wildcards.
 *
 * @param {String} namespaces
 * @api public
 */

function enable(namespaces) {
  exports.save(namespaces);

  exports.names = [];
  exports.skips = [];

  var split = (typeof namespaces === 'string' ? namespaces : '').split(/[\s,]+/);
  var len = split.length;

  for (var i = 0; i < len; i++) {
    if (!split[i]) continue; // ignore empty strings
    namespaces = split[i].replace(/\*/g, '.*?');
    if (namespaces[0] === '-') {
      exports.skips.push(new RegExp('^' + namespaces.substr(1) + '$'));
    } else {
      exports.names.push(new RegExp('^' + namespaces + '$'));
    }
  }
}

/**
 * Disable debug output.
 *
 * @api public
 */

function disable() {
  exports.enable('');
}

/**
 * Returns true if the given mode name is enabled, false otherwise.
 *
 * @param {String} name
 * @return {Boolean}
 * @api public
 */

function enabled(name) {
  var i, len;
  for (i = 0, len = exports.skips.length; i < len; i++) {
    if (exports.skips[i].test(name)) {
      return false;
    }
  }
  for (i = 0, len = exports.names.length; i < len; i++) {
    if (exports.names[i].test(name)) {
      return true;
    }
  }
  return false;
}

/**
 * Coerce `val`.
 *
 * @param {Mixed} val
 * @return {Mixed}
 * @api private
 */

function coerce(val) {
  if (val instanceof Error) return val.stack || val.message;
  return val;
}

},{"ms":5}],4:[function(require,module,exports){
(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports, require('uuid-browser')) :
	typeof define === 'function' && define.amd ? define(['exports', 'uuid-browser'], factory) :
	(factory((global.dolphinsr = global.dolphinsr || {}),global.uuid));
}(this, (function (exports,uuid) { 'use strict';

uuid = 'default' in uuid ? uuid['default'] : uuid;

// Generally all types should be considered opaque in application code.

// -- Data types

function generateId() {
  return uuid.v4();
}

// numbers are indexes on master.fields

function getCardId(o) {
  return o.master + '#' + o.combination.front.join(',') + '@' + o.combination.back.join(',');
}

// -- Computed data types

function makeInitialCardState(master, combination) {
  return {
    master: master,
    combination: combination,

    mode: 'learning',
    consecutiveCorrect: 0,
    lastReviewed: null
  };
}

function makeEmptyState() {
  return {
    cardStates: {}
  };
}

// This function only works if reviews is always sorted by timestamp
function addReview(reviews, review) {
  if (!reviews.length) {
    return [review];
  }

  var i = reviews.length - 1;
  for (; i >= 0; i -= 1) {
    if (reviews[i].ts <= review.ts) {
      break;
    }
  }

  var newReviews = reviews.slice(0);
  newReviews.splice(i + 1, 0, review);

  return newReviews;
}

function dateDiffInDays(a, b) {
  // adapted from http://stackoverflow.com/a/15289883/251162
  var MS_PER_DAY = 1000 * 60 * 60 * 24;

  // Disstate the time and time-zone information.
  var utc1 = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  var utc2 = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());

  return (utc2 - utc1) / MS_PER_DAY;
}

// assumes that the day starts at 3:00am in the local timezone
function calculateDueDate(state) {
  var result = new Date(state.lastReviewed);
  result.setHours(3, 0, 0);
  result.setDate(result.getDate() + Math.ceil(state.interval));
  return result;
}

function computeScheduleFromCardState(state, now) {
  if (state.mode === 'lapsed' || state.mode === 'learning') {
    return 'learning';
  } else if (state.mode === 'reviewing') {
    var diff = dateDiffInDays(calculateDueDate(state), now);
    if (diff < 0) {
      return 'later';
    } else if (diff >= 0 && diff < 1) {
      return 'due';
    } else if (diff >= 1) {
      return 'overdue';
    }
  }
  throw new Error('unreachable');
}

// Breaks ties first by last review (earlier beats later),
// then by an alphabetical comparison of the cardId (just so it stays 100% deterministic)
//
// Returns null if no cards are due.
function pickMostDue(s, state) {
  var prec = ['learning', 'overdue', 'due'];
  for (var i = 0; i < prec.length; i += 1) {
    var sched = prec[i];
    if (s[sched].length) {
      return s[sched].slice(0).sort(function (a, b) {
        var cardA = state.cardStates[a];
        var cardB = state.cardStates[b];
        if (cardA == null) {
          throw new Error('id not found in state: ' + a);
        }
        if (cardB == null) {
          throw new Error('id not found in state: ' + b);
        }

        var reviewDiff = cardA.lastReviewed == null && cardB.lastReviewed != null ? 1 : cardB.lastReviewed == null && cardA.lastReviewed != null ? -1 : cardA.lastReviewed == null && cardB.lastReviewed == null ? 0 : cardB.lastReviewed - cardA.lastReviewed;
        if (reviewDiff !== 0) {
          return -reviewDiff;
        }

        if (a === b) {
          throw new Error('comparing duplicate id: ' + a);
        }
        return b > a ? 1 : -1;
      })[0];
    }
  }
  return null;
}

function computeCardsSchedule(state, now) {
  var s = {
    learning: [],
    later: [],
    due: [],
    overdue: []
  };
  Object.keys(state.cardStates).forEach(function (cardId) {
    var cardState = state.cardStates[cardId];
    s[computeScheduleFromCardState(cardState, now)].push(getCardId(cardState));
  });
  return s;
}

var classCallCheck = function (instance, Constructor) {
  if (!(instance instanceof Constructor)) {
    throw new TypeError("Cannot call a class as a function");
  }
};

var createClass = function () {
  function defineProperties(target, props) {
    for (var i = 0; i < props.length; i++) {
      var descriptor = props[i];
      descriptor.enumerable = descriptor.enumerable || false;
      descriptor.configurable = true;
      if ("value" in descriptor) descriptor.writable = true;
      Object.defineProperty(target, descriptor.key, descriptor);
    }
  }

  return function (Constructor, protoProps, staticProps) {
    if (protoProps) defineProperties(Constructor.prototype, protoProps);
    if (staticProps) defineProperties(Constructor, staticProps);
    return Constructor;
  };
}();







var _extends = Object.assign || function (target) {
  for (var i = 1; i < arguments.length; i++) {
    var source = arguments[i];

    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key)) {
        target[key] = source[key];
      }
    }
  }

  return target;
};





















var slicedToArray = function () {
  function sliceIterator(arr, i) {
    var _arr = [];
    var _n = true;
    var _d = false;
    var _e = undefined;

    try {
      for (var _i = arr[Symbol.iterator](), _s; !(_n = (_s = _i.next()).done); _n = true) {
        _arr.push(_s.value);

        if (i && _arr.length === i) break;
      }
    } catch (err) {
      _d = true;
      _e = err;
    } finally {
      try {
        if (!_n && _i["return"]) _i["return"]();
      } finally {
        if (_d) throw _e;
      }
    }

    return _arr;
  }

  return function (arr, i) {
    if (Array.isArray(arr)) {
      return arr;
    } else if (Symbol.iterator in Object(arr)) {
      return sliceIterator(arr, i);
    } else {
      throw new TypeError("Invalid attempt to destructure non-iterable instance");
    }
  };
}();













var toConsumableArray = function (arr) {
  if (Array.isArray(arr)) {
    for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i];

    return arr2;
  } else {
    return Array.from(arr);
  }
};

var debug$1 = require('debug')('dolphin');

// -- applyToLearningCardState(...)

// constants from Anki defaults
// TODO(April 1, 2017) investigate rationales, consider changing them
var INITIAL_FACTOR = 2500;
var INITIAL_DAYS_WITHOUT_JUMP = 4;
var INITIAL_DAYS_WITH_JUMP = 1;
function applyToLearningCardState(prev, ts, rating) {
  if (rating === 'easy' || rating.match(/^easy|good$/) && prev.consecutiveCorrect > 0) {
    return {
      master: prev.master,
      combination: prev.combination,

      mode: 'reviewing',
      factor: INITIAL_FACTOR,
      lapses: 0,
      interval: prev.consecutiveCorrect > 0 ? INITIAL_DAYS_WITHOUT_JUMP : INITIAL_DAYS_WITH_JUMP,
      lastReviewed: ts
    };
  } else if (rating === 'again') {
    return {
      master: prev.master,
      combination: prev.combination,

      mode: 'learning',
      consecutiveCorrect: 0,
      lastReviewed: ts
    };
  } else if (rating.match(/^good|hard$/) && prev.consecutiveCorrect < 1) {
    return {
      master: prev.master,
      combination: prev.combination,

      mode: 'learning',
      consecutiveCorrect: prev.consecutiveCorrect + 1,
      lastReviewed: ts
    };
  }
  throw new Error('logic error');
}

// -- applyToReviewingCardState(...)

var EASY_BONUS = 2;
var MAX_INTERVAL = 365;
var MIN_FACTOR = 0; // TODO
var MAX_FACTOR = Number.MAX_VALUE;
function constrainWithin(min, max, n) {
  if (min > max) {
    throw new Error('min > max: ' + min + '=min, ' + max + '=max');
  }
  return Math.max(Math.min(n, max), min);
}

function calculateDaysLate(state, actual) {
  var expected = calculateDueDate(state);

  var daysLate = dateDiffInDays(actual, expected);

  if (daysLate < 0) {
    debug$1('last review occured earlier than expected', {
      daysLate: daysLate,
      actual: actual,
      expected: expected
    });
    return 0;
  }

  return daysLate;
}
function applyToReviewingCardState(prev, ts, rating) {
  if (rating === 'again') {
    return {
      master: prev.master,
      combination: prev.combination,

      mode: 'lapsed',
      consecutiveCorrect: 0,
      factor: constrainWithin(MIN_FACTOR, MAX_FACTOR, prev.factor - 200),
      lapses: prev.lapses + 1,
      interval: prev.interval,
      lastReviewed: ts
    };
  }
  var factorAdj = rating === 'hard' ? -150 : rating === 'good' ? 0 : rating === 'easy' ? 150 : NaN;
  var daysLate = calculateDaysLate(prev, ts);

  var ival = constrainWithin(prev.interval + 1, MAX_INTERVAL, rating === 'hard' ? (prev.interval + daysLate / 4) * 1.2 : rating === 'good' ? (prev.interval + daysLate / 2) * prev.factor / 1000 : rating === 'easy' ? (prev.interval + daysLate) * prev.factor / 1000 * EASY_BONUS : NaN);

  if (isNaN(factorAdj) || isNaN(ival)) {
    throw new Error('invalid rating: ' + rating);
  }

  return {
    master: prev.master,
    combination: prev.combination,

    mode: 'reviewing',
    factor: constrainWithin(MIN_FACTOR, MAX_FACTOR, prev.factor + factorAdj),
    lapses: prev.lapses,
    interval: ival,
    lastReviewed: ts
  };
}

// -- applyToLapsedCardState(...)

function applyToLapsedCardState(prev, ts, rating) {
  if (rating === 'easy' || rating.match(/^easy|good$/) && prev.consecutiveCorrect > 0) {
    return {
      master: prev.master,
      combination: prev.combination,

      mode: 'reviewing',
      factor: prev.factor,
      lapses: prev.lapses,
      interval: prev.consecutiveCorrect > 0 ? INITIAL_DAYS_WITHOUT_JUMP : INITIAL_DAYS_WITH_JUMP,
      lastReviewed: ts
    };
  }
  return {
    master: prev.master,
    combination: prev.combination,

    mode: 'lapsed',
    factor: prev.factor,
    lapses: prev.lapses,
    interval: prev.interval,
    lastReviewed: ts,
    consecutiveCorrect: rating === 'again' ? 0 : prev.consecutiveCorrect + 1
  };
}

// -- applyReview(...)


function applyToCardState(prev, ts, rating) {
  if (prev.lastReviewed != null && prev.lastReviewed > ts) {
    var p = prev.lastReviewed.toISOString();
    var t = ts.toISOString();
    throw new Error('cannot apply review before current lastReviewed: ' + p + ' > ' + t);
  }

  if (prev.mode === 'learning') {
    return applyToLearningCardState(prev, ts, rating);
  } else if (prev.mode === 'reviewing') {
    return applyToReviewingCardState(prev, ts, rating);
  } else if (prev.mode === 'lapsed') {
    return applyToLapsedCardState(prev, ts, rating);
  }
  throw new Error('invalid mode: ' + prev.mode);
}

function applyReview(prev, review) {
  var cardId = getCardId(review);

  var cardState = prev.cardStates[cardId];
  if (cardState == null) {
    throw new Error('applying review to missing card: ' + JSON.stringify(review));
  }

  var state = {
    cardStates: _extends({}, prev.cardStates)
  };
  state.cardStates[cardId] = applyToCardState(cardState, review.ts, review.rating);

  return state;
}

var debug = require('debug')('dolphin');

var DolphinSR = function () {

  // TODO(April 3, 2017)
  // Currently the cachedCardsSchedule is not invalidated when the time changes (only when a review
  // or master is added), so there is a possibility for cards not switching from due to overdue
  // properly. In practice, this has not been a significant issue -- easy fix for later.
  function DolphinSR() {
    var currentDateGetter = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : function () {
      return new Date();
    };
    classCallCheck(this, DolphinSR);

    this._state = makeEmptyState();
    this._masters = {};
    this._reviews = [];
    this._currentDateGetter = currentDateGetter;
  }

  // gotcha: does not invalidate cache, that happens in addMasters()


  // For testing, you can swap this out with a different function to change when 'now' is.


  createClass(DolphinSR, [{
    key: '_addMaster',
    value: function _addMaster(master) {
      var _this = this;

      if (this._masters[master.id]) {
        throw new Error('master already added: ' + master.id);
      }
      master.combinations.forEach(function (combination) {
        var id = getCardId({ master: master.id, combination: combination });
        _this._state.cardStates[id] = makeInitialCardState(master.id, combination);
      });
      this._masters[master.id] = master;
    }
  }, {
    key: 'addMasters',
    value: function addMasters() {
      var _this2 = this;

      for (var _len = arguments.length, masters = Array(_len), _key = 0; _key < _len; _key++) {
        masters[_key] = arguments[_key];
      }

      masters.forEach(function (master) {
        return _this2._addMaster(master);
      });
      this._cachedCardsSchedule = null;
    }

    // gotcha: does not apply the reviews to state or invalidate cache, that happens in addReviews()

  }, {
    key: '_addReviewToReviews',
    value: function _addReviewToReviews(review) {
      this._reviews = addReview(this._reviews, review);
      var lastReview = this._reviews[this._reviews.length - 1];

      return getCardId(lastReview) + '#' + lastReview.ts.toISOString() !== getCardId(review) + '#' + review.ts.toISOString();
    }

    // Returns true if the entire state was rebuilt (inefficient, minimize)

  }, {
    key: 'addReviews',
    value: function addReviews() {
      var _this3 = this;

      for (var _len2 = arguments.length, reviews = Array(_len2), _key2 = 0; _key2 < _len2; _key2++) {
        reviews[_key2] = arguments[_key2];
      }

      var needsRebuild = reviews.reduce(function (v, review) {
        if (_this3._addReviewToReviews(review)) {
          return true;
        }
        return v;
      }, false);

      if (needsRebuild) {
        this._rebuild();
      } else {
        reviews.forEach(function (review) {
          _this3._state = applyReview(_this3._state, review);
        });
      }

      this._cachedCardsSchedule = null;

      return needsRebuild;
    }
  }, {
    key: '_rebuild',
    value: function _rebuild() {
      debug('rebuilding state');
      var masters = this._masters;
      var reviews = this._reviews;
      this._masters = {};
      this._reviews = [];

      this.addMasters.apply(this, toConsumableArray(Object.keys(masters).map(function (k) {
        return masters[k];
      })));
      this.addReviews.apply(this, toConsumableArray(reviews));
    }
  }, {
    key: '_getCardsSchedule',
    value: function _getCardsSchedule() {
      if (this._cachedCardsSchedule != null) {
        return this._cachedCardsSchedule;
      }
      this._cachedCardsSchedule = computeCardsSchedule(this._state, this._currentDateGetter());
      return this._cachedCardsSchedule;
    }
  }, {
    key: '_nextCardId',
    value: function _nextCardId() {
      var s = this._getCardsSchedule();
      return pickMostDue(s, this._state);
    }
  }, {
    key: '_getCard',
    value: function _getCard(id) {
      var _id$split = id.split('#'),
          _id$split2 = slicedToArray(_id$split, 2),
          masterId = _id$split2[0],
          combo = _id$split2[1];

      var _combo$split$map = combo.split('@').map(function (part) {
        return part.split(',').map(function (x) {
          return parseInt(x, 10);
        });
      }),
          _combo$split$map2 = slicedToArray(_combo$split$map, 2),
          front = _combo$split$map2[0],
          back = _combo$split$map2[1];

      var master = this._masters[masterId];
      if (master == null) {
        throw new Error('cannot getCard: no such master: ' + masterId);
      }
      var combination = { front: front, back: back };

      var frontFields = front.map(function (i) {
        return master.fields[i];
      });
      var backFields = back.map(function (i) {
        return master.fields[i];
      });

      return {
        master: masterId,
        combination: combination,

        front: frontFields,
        back: backFields
      };
    }
  }, {
    key: 'nextCard',
    value: function nextCard() {
      var cardId = this._nextCardId();
      if (cardId == null) {
        return null;
      }
      return this._getCard(cardId);
    }
  }, {
    key: 'summary',
    value: function summary() {
      var s = this._getCardsSchedule();
      return {
        due: s.due.length,
        later: s.later.length,
        learning: s.learning.length,
        overdue: s.overdue.length
      };
    }
  }]);
  return DolphinSR;
}();

exports.generateId = generateId;
exports.DolphinSR = DolphinSR;

Object.defineProperty(exports, '__esModule', { value: true });

})));


},{"debug":2,"uuid-browser":7}],5:[function(require,module,exports){
/**
 * Helpers.
 */

var s = 1000;
var m = s * 60;
var h = m * 60;
var d = h * 24;
var y = d * 365.25;

/**
 * Parse or format the given `val`.
 *
 * Options:
 *
 *  - `long` verbose formatting [false]
 *
 * @param {String|Number} val
 * @param {Object} [options]
 * @throws {Error} throw an error if val is not a non-empty string or a number
 * @return {String|Number}
 * @api public
 */

module.exports = function(val, options) {
  options = options || {};
  var type = typeof val;
  if (type === 'string' && val.length > 0) {
    return parse(val);
  } else if (type === 'number' && isNaN(val) === false) {
    return options.long ? fmtLong(val) : fmtShort(val);
  }
  throw new Error(
    'val is not a non-empty string or a valid number. val=' +
      JSON.stringify(val)
  );
};

/**
 * Parse the given `str` and return milliseconds.
 *
 * @param {String} str
 * @return {Number}
 * @api private
 */

function parse(str) {
  str = String(str);
  if (str.length > 100) {
    return;
  }
  var match = /^((?:\d+)?\.?\d+) *(milliseconds?|msecs?|ms|seconds?|secs?|s|minutes?|mins?|m|hours?|hrs?|h|days?|d|years?|yrs?|y)?$/i.exec(
    str
  );
  if (!match) {
    return;
  }
  var n = parseFloat(match[1]);
  var type = (match[2] || 'ms').toLowerCase();
  switch (type) {
    case 'years':
    case 'year':
    case 'yrs':
    case 'yr':
    case 'y':
      return n * y;
    case 'days':
    case 'day':
    case 'd':
      return n * d;
    case 'hours':
    case 'hour':
    case 'hrs':
    case 'hr':
    case 'h':
      return n * h;
    case 'minutes':
    case 'minute':
    case 'mins':
    case 'min':
    case 'm':
      return n * m;
    case 'seconds':
    case 'second':
    case 'secs':
    case 'sec':
    case 's':
      return n * s;
    case 'milliseconds':
    case 'millisecond':
    case 'msecs':
    case 'msec':
    case 'ms':
      return n;
    default:
      return undefined;
  }
}

/**
 * Short format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtShort(ms) {
  if (ms >= d) {
    return Math.round(ms / d) + 'd';
  }
  if (ms >= h) {
    return Math.round(ms / h) + 'h';
  }
  if (ms >= m) {
    return Math.round(ms / m) + 'm';
  }
  if (ms >= s) {
    return Math.round(ms / s) + 's';
  }
  return ms + 'ms';
}

/**
 * Long format for `ms`.
 *
 * @param {Number} ms
 * @return {String}
 * @api private
 */

function fmtLong(ms) {
  return plural(ms, d, 'day') ||
    plural(ms, h, 'hour') ||
    plural(ms, m, 'minute') ||
    plural(ms, s, 'second') ||
    ms + ' ms';
}

/**
 * Pluralization helper.
 */

function plural(ms, n, name) {
  if (ms < n) {
    return;
  }
  if (ms < n * 1.5) {
    return Math.floor(ms / n) + ' ' + name;
  }
  return Math.ceil(ms / n) + ' ' + name + 's';
}

},{}],6:[function(require,module,exports){
// shim for using process in browser
var process = module.exports = {};

// cached from whatever global is present so that test runners that stub it
// don't break things.  But we need to wrap it in a try catch in case it is
// wrapped in strict mode code which doesn't define any globals.  It's inside a
// function because try/catches deoptimize in certain engines.

var cachedSetTimeout;
var cachedClearTimeout;

function defaultSetTimout() {
    throw new Error('setTimeout has not been defined');
}
function defaultClearTimeout () {
    throw new Error('clearTimeout has not been defined');
}
(function () {
    try {
        if (typeof setTimeout === 'function') {
            cachedSetTimeout = setTimeout;
        } else {
            cachedSetTimeout = defaultSetTimout;
        }
    } catch (e) {
        cachedSetTimeout = defaultSetTimout;
    }
    try {
        if (typeof clearTimeout === 'function') {
            cachedClearTimeout = clearTimeout;
        } else {
            cachedClearTimeout = defaultClearTimeout;
        }
    } catch (e) {
        cachedClearTimeout = defaultClearTimeout;
    }
} ())
function runTimeout(fun) {
    if (cachedSetTimeout === setTimeout) {
        //normal enviroments in sane situations
        return setTimeout(fun, 0);
    }
    // if setTimeout wasn't available but was latter defined
    if ((cachedSetTimeout === defaultSetTimout || !cachedSetTimeout) && setTimeout) {
        cachedSetTimeout = setTimeout;
        return setTimeout(fun, 0);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedSetTimeout(fun, 0);
    } catch(e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't trust the global object when called normally
            return cachedSetTimeout.call(null, fun, 0);
        } catch(e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error
            return cachedSetTimeout.call(this, fun, 0);
        }
    }


}
function runClearTimeout(marker) {
    if (cachedClearTimeout === clearTimeout) {
        //normal enviroments in sane situations
        return clearTimeout(marker);
    }
    // if clearTimeout wasn't available but was latter defined
    if ((cachedClearTimeout === defaultClearTimeout || !cachedClearTimeout) && clearTimeout) {
        cachedClearTimeout = clearTimeout;
        return clearTimeout(marker);
    }
    try {
        // when when somebody has screwed with setTimeout but no I.E. maddness
        return cachedClearTimeout(marker);
    } catch (e){
        try {
            // When we are in I.E. but the script has been evaled so I.E. doesn't  trust the global object when called normally
            return cachedClearTimeout.call(null, marker);
        } catch (e){
            // same as above but when it's a version of I.E. that must have the global object for 'this', hopfully our context correct otherwise it will throw a global error.
            // Some versions of I.E. have different rules for clearTimeout vs setTimeout
            return cachedClearTimeout.call(this, marker);
        }
    }



}
var queue = [];
var draining = false;
var currentQueue;
var queueIndex = -1;

function cleanUpNextTick() {
    if (!draining || !currentQueue) {
        return;
    }
    draining = false;
    if (currentQueue.length) {
        queue = currentQueue.concat(queue);
    } else {
        queueIndex = -1;
    }
    if (queue.length) {
        drainQueue();
    }
}

function drainQueue() {
    if (draining) {
        return;
    }
    var timeout = runTimeout(cleanUpNextTick);
    draining = true;

    var len = queue.length;
    while(len) {
        currentQueue = queue;
        queue = [];
        while (++queueIndex < len) {
            if (currentQueue) {
                currentQueue[queueIndex].run();
            }
        }
        queueIndex = -1;
        len = queue.length;
    }
    currentQueue = null;
    draining = false;
    runClearTimeout(timeout);
}

process.nextTick = function (fun) {
    var args = new Array(arguments.length - 1);
    if (arguments.length > 1) {
        for (var i = 1; i < arguments.length; i++) {
            args[i - 1] = arguments[i];
        }
    }
    queue.push(new Item(fun, args));
    if (queue.length === 1 && !draining) {
        runTimeout(drainQueue);
    }
};

// v8 likes predictible objects
function Item(fun, array) {
    this.fun = fun;
    this.array = array;
}
Item.prototype.run = function () {
    this.fun.apply(null, this.array);
};
process.title = 'browser';
process.browser = true;
process.env = {};
process.argv = [];
process.version = ''; // empty string to avoid regexp issues
process.versions = {};

function noop() {}

process.on = noop;
process.addListener = noop;
process.once = noop;
process.off = noop;
process.removeListener = noop;
process.removeAllListeners = noop;
process.emit = noop;
process.prependListener = noop;
process.prependOnceListener = noop;

process.listeners = function (name) { return [] }

process.binding = function (name) {
    throw new Error('process.binding is not supported');
};

process.cwd = function () { return '/' };
process.chdir = function (dir) {
    throw new Error('process.chdir is not supported');
};
process.umask = function() { return 0; };

},{}],7:[function(require,module,exports){
var v1 = require('./v1');
var v4 = require('./v4');

var uuid = v4;
uuid.v1 = v1;
uuid.v4 = v4;

module.exports = uuid;

},{"./v1":10,"./v4":11}],8:[function(require,module,exports){
/**
 * Convert array of 16 byte values to UUID string format of the form:
 * XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX
 */
var byteToHex = [];
for (var i = 0; i < 256; ++i) {
  byteToHex[i] = (i + 0x100).toString(16).substr(1);
}

function bytesToUuid(buf, offset) {
  var i = offset || 0;
  var bth = byteToHex;
  return bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] + '-' +
          bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]] +
          bth[buf[i++]] + bth[buf[i++]];
}

module.exports = bytesToUuid;

},{}],9:[function(require,module,exports){
(function (global){
// Unique ID creation requires a high quality random # generator.  In the
// browser this is a little complicated due to unknown quality of Math.random()
// and inconsistent support for the `crypto` API.  We do the best we can via
// feature-detection
var rng;

var crypto = typeof global !== 'undefined' && (global.crypto || global.msCrypto); // for IE 11
if (crypto && crypto.getRandomValues) {
  // WHATWG crypto RNG - http://wiki.whatwg.org/wiki/Crypto
  var rnds8 = new Uint8Array(16); // eslint-disable-line no-undef
  rng = function whatwgRNG() {
    crypto.getRandomValues(rnds8);
    return rnds8;
  };
}

if (!rng) {
  // Math.random()-based (RNG)
  //
  // If all else fails, use Math.random().  It's fast, but is of unspecified
  // quality.
  var rnds = new Array(16);
  rng = function() {
    for (var i = 0, r; i < 16; i++) {
      if ((i & 0x03) === 0) r = Math.random() * 0x100000000;
      rnds[i] = r >>> ((i & 0x03) << 3) & 0xff;
    }

    return rnds;
  };
}

module.exports = rng;

}).call(this,typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : typeof window !== "undefined" ? window : {})
},{}],10:[function(require,module,exports){
var rng = require('./lib/rng-browser');
var bytesToUuid = require('./lib/bytesToUuid');

// **`v1()` - Generate time-based UUID**
//
// Inspired by https://github.com/LiosK/UUID.js
// and http://docs.python.org/library/uuid.html

// random #'s we need to init node and clockseq
var _seedBytes = rng();

// Per 4.5, create and 48-bit node id, (47 random bits + multicast bit = 1)
var _nodeId = [
  _seedBytes[0] | 0x01,
  _seedBytes[1], _seedBytes[2], _seedBytes[3], _seedBytes[4], _seedBytes[5]
];

// Per 4.2.2, randomize (14 bit) clockseq
var _clockseq = (_seedBytes[6] << 8 | _seedBytes[7]) & 0x3fff;

// Previous uuid creation time
var _lastMSecs = 0, _lastNSecs = 0;

// See https://github.com/broofa/node-uuid for API details
function v1(options, buf, offset) {
  var i = buf && offset || 0;
  var b = buf || [];

  options = options || {};

  var clockseq = options.clockseq !== undefined ? options.clockseq : _clockseq;

  // UUID timestamps are 100 nano-second units since the Gregorian epoch,
  // (1582-10-15 00:00).  JSNumbers aren't precise enough for this, so
  // time is handled internally as 'msecs' (integer milliseconds) and 'nsecs'
  // (100-nanoseconds offset from msecs) since unix epoch, 1970-01-01 00:00.
  var msecs = options.msecs !== undefined ? options.msecs : new Date().getTime();

  // Per 4.2.1.2, use count of uuid's generated during the current clock
  // cycle to simulate higher resolution clock
  var nsecs = options.nsecs !== undefined ? options.nsecs : _lastNSecs + 1;

  // Time since last uuid creation (in msecs)
  var dt = (msecs - _lastMSecs) + (nsecs - _lastNSecs)/10000;

  // Per 4.2.1.2, Bump clockseq on clock regression
  if (dt < 0 && options.clockseq === undefined) {
    clockseq = clockseq + 1 & 0x3fff;
  }

  // Reset nsecs if clock regresses (new clockseq) or we've moved onto a new
  // time interval
  if ((dt < 0 || msecs > _lastMSecs) && options.nsecs === undefined) {
    nsecs = 0;
  }

  // Per 4.2.1.2 Throw error if too many uuids are requested
  if (nsecs >= 10000) {
    throw new Error('uuid.v1(): Can\'t create more than 10M uuids/sec');
  }

  _lastMSecs = msecs;
  _lastNSecs = nsecs;
  _clockseq = clockseq;

  // Per 4.1.4 - Convert from unix epoch to Gregorian epoch
  msecs += 12219292800000;

  // `time_low`
  var tl = ((msecs & 0xfffffff) * 10000 + nsecs) % 0x100000000;
  b[i++] = tl >>> 24 & 0xff;
  b[i++] = tl >>> 16 & 0xff;
  b[i++] = tl >>> 8 & 0xff;
  b[i++] = tl & 0xff;

  // `time_mid`
  var tmh = (msecs / 0x100000000 * 10000) & 0xfffffff;
  b[i++] = tmh >>> 8 & 0xff;
  b[i++] = tmh & 0xff;

  // `time_high_and_version`
  b[i++] = tmh >>> 24 & 0xf | 0x10; // include version
  b[i++] = tmh >>> 16 & 0xff;

  // `clock_seq_hi_and_reserved` (Per 4.2.2 - include variant)
  b[i++] = clockseq >>> 8 | 0x80;

  // `clock_seq_low`
  b[i++] = clockseq & 0xff;

  // `node`
  var node = options.node || _nodeId;
  for (var n = 0; n < 6; ++n) {
    b[i + n] = node[n];
  }

  return buf ? buf : bytesToUuid(b);
}

module.exports = v1;

},{"./lib/bytesToUuid":8,"./lib/rng-browser":9}],11:[function(require,module,exports){
var rng = require('./lib/rng-browser');
var bytesToUuid = require('./lib/bytesToUuid');

function v4(options, buf, offset) {
  var i = buf && offset || 0;

  if (typeof(options) == 'string') {
    buf = options == 'binary' ? new Array(16) : null;
    options = null;
  }
  options = options || {};

  var rnds = options.random || (options.rng || rng)();

  // Per 4.4, set bits for version and `clock_seq_hi_and_reserved`
  rnds[6] = (rnds[6] & 0x0f) | 0x40;
  rnds[8] = (rnds[8] & 0x3f) | 0x80;

  // Copy bytes to buffer, if provided
  if (buf) {
    for (var ii = 0; ii < 16; ++ii) {
      buf[i + ii] = rnds[ii];
    }
  }

  return buf || bytesToUuid(rnds);
}

module.exports = v4;

},{"./lib/bytesToUuid":8,"./lib/rng-browser":9}]},{},[1]);
