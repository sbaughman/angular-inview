// # Angular-Inview
// - Author: [Nicola Peduzzi](https://github.com/thenikso)
// - Repository: https://github.com/thenikso/angular-inview
// - Install with: `npm install angular-inview@beta`
// - Version: **2.1.0**

// An [angular.js](https://angularjs.org) directive to evaluate an expression if
// a DOM element is or not in the current visible browser viewport.
// Use it in your AngularJS app by including the javascript and requireing it:
//
// `angular.module('myApp', ['angular-inview'])`
let angularInviewModule = angular.module('angular-inview', [])

// ## in-view directive
//
// ### Usage
// ```html
// <any in-view="{expression}" [in-view-options="{object}"]></any>
// ```
.directive('inView', ['$parse', inViewDirective])

// ## in-view-container directive
.directive('inViewContainer', inViewContainerDirective);

// ## Implementation
function inViewDirective ($parse) {
  return {
    // Evaluate the expression passet to the attribute `in-view` when the DOM
    // element is visible in the viewport.
    restrict: 'A',
    require: '?^^inViewContainer',
    link: function inViewDirectiveLink (scope, element, attrs, container) {

      interface Options {
        offset: number[];
        viewportOffset: number[];
        generateDirection: boolean;
        generateParts: boolean;
        throttle: number;
      }

      // in-view-options attribute can be specified with an object expression
      // containing:
      //   - `offset`: An array of values to offset the element position.
      //     Offsets are expressed as arrays of 4 numbers [top, right, bottom, left].
      //     Like CSS, you can also specify only 2 numbers [top/bottom, left/right].
      //     Instead of numbers, some array elements can be a string with a percentage.
      //     Positive numbers are offsets outside the element rectangle and
      //     negative numbers are offsets to the inside.
      //   - `viewportOffset`: Like the element offset but appied to the viewport.
      //   - `generateDirection`: Indicate if the `direction` information should
      //     be included in `$inviewInfo` (default false).
      //   - `generateParts`: Indicate if the `parts` information should
      //     be included in `$inviewInfo` (default false).
      //   - `throttle`: Specify a number of milliseconds by which to limit the
      //     number of incoming events.
      let options = {} as Options;
      if (attrs.inViewOptions) {
        options = scope.$eval(attrs.inViewOptions);
      }
      if (options.offset) {
        options.offset = normalizeOffset(options.offset);
      }
      if (options.viewportOffset) {
        options.viewportOffset = normalizeOffset(options.viewportOffset);
      }

      // Build reactive chain from an initial event
      let viewportEventSignal = signalSingle({ type: 'initial' })

      // Merged with the window events
      .merge(signalFromEvent(window, 'checkInView click ready wheel mousewheel DomMouseScroll MozMousePixelScroll resize scroll touchmove mouseup keydown'))

      // Merge with container's events signal
      if (container) {
        viewportEventSignal = viewportEventSignal.merge(container.eventsSignal);
      }

      // Throttle if option specified
      if (options.throttle) {
        viewportEventSignal = viewportEventSignal.throttle(options.throttle);
      }

      // Map to viewport intersection and in-view informations
      let inviewInfoSignal = viewportEventSignal

      // Inview information structure contains:
      //   - `inView`: a boolean value indicating if the element is
      //     visible in the viewport;
      //   - `changed`: a boolean value indicating if the inview status
      //     changed after the last event;
      //   - `event`: the event that initiated the in-view check;
      .map(event => {
        let viewportRect;
        if (container) {
          viewportRect = container.getViewportRect();
          // TODO merge with actual window!
        } else {
          viewportRect = getViewportRect();
        }
        viewportRect = offsetRect(viewportRect, options.viewportOffset);
        let elementRect = offsetRect(element[0].getBoundingClientRect(), options.offset);

        interface Info {
          inView: boolean;
          event: Event;
          element: any;
          elementRect: any;
          viewportRect: any;
          parts: any;
        }
        
        let info = {} as Info;

        info.inView = intersectRect(elementRect, viewportRect);
        info.event = event;
        info.element = element;
        info.elementRect =  elementRect;
        info.viewportRect = viewportRect;

        // Add inview parts
        if (options.generateParts && info.inView) {
          info.parts = {};
          info.parts.top = elementRect.top >= viewportRect.top;
          info.parts.left = elementRect.left >= viewportRect.left;
          info.parts.bottom = elementRect.bottom <= viewportRect.bottom;
          info.parts.right = elementRect.right <= viewportRect.right;
        }
        return info;
      })

      // Add the changed information to the inview structure.
      .scan({}, (lastInfo, newInfo) => {
        // Add inview direction info
        if (options.generateDirection && newInfo.inView && lastInfo.elementRect) {
          newInfo.direction = {
            horizontal: newInfo.elementRect.left - lastInfo.elementRect.left,
            vertical: newInfo.elementRect.top - lastInfo.elementRect.top
          };
        }
        // Calculate changed flag
        newInfo.changed =
          newInfo.inView !== lastInfo.inView ||
          !angular.equals(newInfo.parts, lastInfo.parts) ||
          !angular.equals(newInfo.direction, lastInfo.direction);
        return newInfo;
      })

      // Filters only informations that should be forwarded to the callback
      .filter(info => {
        // Don't forward if no relevant infomation changed
        if (!info.changed) {
          return false;
        }
        // Don't forward if not initially in-view
        if (info.event.type === 'initial' && !info.inView) {
          return false;
        }
        return true;
      });

      // Execute in-view callback
      let inViewExpression = $parse(attrs.inView);
      let dispose = inviewInfoSignal.subscribe(info => {
        scope.$applyAsync(() => {
          inViewExpression(scope, {
            '$inview': info.inView,
            '$inviewInfo': info
          });
        });
      });

      // Dispose of reactive chain
      scope.$on('$destroy', dispose);
    }
  }
}

function inViewContainerDirective () {
  return {
    restrict: 'A',
    controller: ['$element', function ($element) {
      this.element = $element;
      this.eventsSignal = signalFromEvent($element, 'scroll');
      this.getViewportRect = () => {
        return $element[0].getBoundingClientRect();
      };
    }]
  }
}

// ## Utilities

function getViewportRect () {
  let result = {
    top: 0,
    left: 0,
    width: window.innerWidth,
    right: window.innerWidth,
    height: window.innerHeight,
    bottom: window.innerHeight
  };
  if (result.height) {
    return result;
  }
  let mode = document.compatMode;
  if (mode === 'CSS1Compat') {
    result.width = result.right = document.documentElement.clientWidth;
    result.height = result.bottom = document.documentElement.clientHeight;
  } else {
    result.width = result.right = document.body.clientWidth;
    result.height = result.bottom = document.body.clientHeight;
  }
  return result;
}

function intersectRect (r1, r2) {
  return !(r2.left > r1.right ||
           r2.right < r1.left ||
           r2.top > r1.bottom ||
           r2.bottom < r1.top);
}

function normalizeOffset (offset) {
  if (!angular.isArray(offset)) {
    return [offset, offset, offset, offset];
  }
  if (offset.length == 2) {
    return offset.concat(offset);
  }
  else if (offset.length == 3) {
    return offset.concat([offset[1]]);
  }
  return offset;
}

function offsetRect (rect, offset) {
  if (!offset) {
    return rect;
  }
  let offsetObject = {
    top: isPercent(offset[0]) ? (parseFloat(offset[0]) * rect.height) : offset[0],
    right: isPercent(offset[1]) ? (parseFloat(offset[1]) * rect.width) : offset[1],
    bottom: isPercent(offset[2]) ? (parseFloat(offset[2]) * rect.height) : offset[2],
    left: isPercent(offset[3]) ? (parseFloat(offset[3]) * rect.width) : offset[3]
  };
  // Note: ClientRect object does not allow its properties to be written to therefore a new object has to be created.
  return {
    top: rect.top - offsetObject.top,
    left: rect.left - offsetObject.left,
    bottom: rect.bottom + offsetObject.bottom,
    right: rect.right + offsetObject.right,
    height: rect.height + offsetObject.top + offsetObject.bottom,
    width: rect.width + offsetObject.left + offsetObject.right
  };
}

function isPercent (n) {
  return angular.isString(n) && n.indexOf('%') > 0;
}

// ## QuickSignal FRP
// A quick and dirty implementation of Rx to have a streamlined code in the
// directives.

// ### QuickSignal
//
// - `didSubscribeFunc`: a function receiving a `subscriber` as described below
//
// Usage:
//     let mySignal = new QuickSignal(function(subscriber) { ... })
class QuickSignal {

  constructor(public didSubscribeFunc) {
  }
  
  // Subscribe to a signal and consume the steam of data.
  //
  // Returns a function that can be called to stop the signal stream of data and
  // perform cleanup.
  //
  // A `subscriber` is a function that will be called when a new value arrives.
  // a `subscriber.$dispose` property can be set to a function to be called uppon
  // disposal. When setting the `$dispose` function, the previously set function
  // should be chained.
  subscribe(subscriber) {
    this.didSubscribeFunc(subscriber);
    let dispose = () => {
      if (subscriber.$dispose) {
        subscriber.$dispose();
        subscriber.$dispose = null;
      }
    }
    return dispose;
  }

  map(f) {
    return new QuickSignal((subscriber) => {
      subscriber.$dispose = this.subscribe((nextValue) => {
        subscriber(f(nextValue));
      });
    });
  }

  filter(f) {
    return new QuickSignal((subscriber) => {
      subscriber.$dispose = this.subscribe((nextValue) => {
        if (f(nextValue)) {
          subscriber(nextValue);
        }
      });
    });
  }

  scan(initial, scanFunc) {
    return new QuickSignal((subscriber) => {
      let last = initial;
      subscriber.$dispose = this.subscribe((nextValue) => {
        last = scanFunc(last, nextValue);
        subscriber(last);
      });
    });
  }

  merge(signal) {
    return this.signalMerge(this, signal);
  }

  throttle(threshhold) {
    let last, deferTimer;
    return new QuickSignal((subscriber) => {
      let chainDisposable = this.subscribe(function () {
        let now = +new Date,
            args = arguments;
        if (last && now < last + threshhold) {
          clearTimeout(deferTimer);
          deferTimer = setTimeout(() => {
            last = now;
            subscriber.apply(null, args);
          }, threshhold);
        } else {
          last = now;
          subscriber.apply(null, args);
        }
      });
      subscriber.$dispose = () => {
        clearTimeout(deferTimer);
        if (chainDisposable) chainDisposable();
      };
    });
  }

  signalMerge (...args) {
    let signals = arguments;
    return new QuickSignal((subscriber) => {
      let disposables = [];
      for (let i = signals.length - 1; i >= 0; i--) {
        disposables.push(signals[i].subscribe(function () {
          subscriber.apply(null, arguments);
        }));
      }
      subscriber.$dispose = () => {
        for (let i = disposables.length - 1; i >= 0; i--) {
          if (disposables[i]) disposables[i]();
        }
      }
    });
  }
}

// Returns a signal from DOM events of a target.
function signalFromEvent (target, event) {
  return new QuickSignal((subscriber) => {
    let handler = (e) => {
      subscriber(e);
    };
    let el = angular.element(target);
    el.on(event, handler);
    subscriber.$dispose = () => {
      el.off(event, handler);
    };
  });
}

function signalSingle (value) {
  return new QuickSignal((subscriber) => {
    setTimeout(() => { subscriber(value); });
  });
}
