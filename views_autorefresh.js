(function ($) {
// START jQuery

Drupal.views_autorefresh = Drupal.views_autorefresh || {};

// Close timers on page unload.
window.addEventListener('unload', function(event) {
  $.each(Drupal.settings.views_autorefresh, function(index, entry) {
    clearTimeout(entry.timer);
  });
});

Drupal.behaviors.views_autorefresh = {
  attach: function(context, settings) {
    if (Drupal.settings && Drupal.settings.views && Drupal.settings.views.ajaxViews) {
      var ajax_path = Drupal.settings.views.ajax_path;
      // If there are multiple views this might've ended up showing up multiple times.
      if (ajax_path.constructor.toString().indexOf("Array") != -1) {
        ajax_path = ajax_path[0];
      }
      $.each(Drupal.settings.views.ajaxViews, function(i, settings) {
        var viewDom = '.view-dom-id-' + settings.view_dom_id;
        var view = settings.view_name + '-' + settings.view_display_id;

        // Reset view_args if it had been set previously,
        // to avoid mistakenly applying exposed filters with timestamp.
        if (typeof Drupal.settings.views_autorefresh[view].view_args != 'undefined') {
          settings.view_args = Drupal.settings.views_autorefresh[view].view_args;
        }

        if (!$(viewDom).size()) {
          // Backward compatibility: if 'views-view.tpl.php' is old and doesn't
          // contain the 'view-dom-id-#' class, we fall back to the old way of
          // locating the view:
          viewDom = '.view-id-' + settings.view_name + '.view-display-id-' + settings.view_display_id;
        }

        $(viewDom).filter(':not(.views-autorefresh-processed)')
          // Don't attach to nested views. Doing so would attach multiple behaviors
          // to a given element.
          .filter(function() {
            // If there is at least one parent with a view class, this view
            // is nested (e.g., an attachment). Bail.
            return !$(this).parents('.view').size();
          })
          .each(function() {
            if (Drupal.settings.views_autorefresh[view] && !Drupal.settings.views_autorefresh[view].incremental) {
              $('select,input,textarea', this)
                .click(function () {
                  clearTimeout(Drupal.settings.views_autorefresh[view].timer);
                })
                .change(function () {
                  clearTimeout(Drupal.settings.views_autorefresh[view].timer);
                });
            }
            var target = this;
            $(this)
              .addClass('views-autorefresh-processed')
              .find('.auto-refresh a')
              .each(function () {
                // Construct an object using the settings defaults and then overriding
                // with data specific to the link.
                var view_data = { 'js': 1, 'autorefresh': 1 };
                var anchor = this;
                $.extend(
                  view_data,
                  Drupal.Views.parseQueryString($(this).attr('href')),
                  // Extract argument data from the URL.
                  Drupal.Views.parseViewArgs($(this).attr('href'), settings.view_base_path),
                  // Settings must be used last to avoid sending url aliases to the server.
                  settings
                );
                // Remove pager element to always fetch latest results.
                delete view_data.pager_element;
                // Cache view_args for later manipulation.
                Drupal.settings.views_autorefresh[view].view_args = view_data.view_args;
                // Create the Drupal.ajax object.
                Drupal.settings.views_autorefresh[view].ajax = new Drupal.ajax(view, this, {
                  url: ajax_path,
                  event: 'click',
                  selector: view,
                  submit: view_data
                });

                // Activate refresh timer if not using nodejs.
                if (!Drupal.settings.views_autorefresh[view].nodejs) {
                  clearTimeout(Drupal.settings.views_autorefresh[view].timer);
                  Drupal.views_autorefresh.timer(view, anchor, target);
                } else { // otherwise prepare to use nodejs
                  Drupal.settings.views_autorefresh[view].anchor = anchor;
                  Drupal.settings.views_autorefresh[view].target = target;
                }
              }); // .each function () {
        }); // $view.filter().each
      });
    }
  }
}

Drupal.views_autorefresh.timer = function(view_name, anchor, target) {
  Drupal.settings.views_autorefresh[view_name].timer = setTimeout(function() {
    clearTimeout(Drupal.settings.views_autorefresh[view_name].timer);
    Drupal.views_autorefresh.refresh(view_name, anchor, target)
  }, Drupal.settings.views_autorefresh[view_name].interval);
}

Drupal.views_autorefresh.refresh = function(view_name, anchor, target) {
  // Turn off "new" items class.
  // TODO Move this to its own timer.
  $('.views-autorefresh-new', target).removeClass('views-autorefresh-new');

  // Adjust timestamp argument.
  if (Drupal.settings.views_autorefresh[view_name].incremental) {
    var view_args = Drupal.settings.views_autorefresh[view_name].view_args;
    view_args += (view_args.length > 0 ? '/' : '') + Drupal.settings.views_autorefresh[view_name].timestamp;
    Drupal.settings.views_autorefresh[view_name].ajax.submit.view_args = view_args;
  }

  // If there's a ping URL, hit it first.
  if (Drupal.settings.views_autorefresh[view_name].ping) {
    var ping_data = { 'timestamp': Drupal.settings.views_autorefresh[view_name].timestamp };
    $.extend(ping_data, Drupal.settings.views_autorefresh[view_name].ping.ping_args);
    $.ajax({
      url: Drupal.settings.basePath + Drupal.settings.views_autorefresh[view_name].ping.ping_base_path,
      data: ping_data,
      success: function(response) {
        if (response.pong && parseInt(response.pong) > 0) {
          $(target).trigger('autorefresh_ping', parseInt(response.pong));
          $(anchor).trigger('click');
        }
        else if (!Drupal.settings.views_autorefresh[view_name].nodejs) {
          Drupal.views_autorefresh.timer(view_name, anchor, target);
        }
      },
      error: function(xhr) {},
      dataType: 'json',
    });
  }
  else {
    $(anchor).trigger('click');
  }
}

Drupal.ajax.prototype.commands.viewsAutoRefreshTriggerUpdate = function (ajax, response, status) {
  $(response.selector).trigger('autorefresh_update', response.timestamp);
}

// http://stackoverflow.com/questions/1394020/jquery-each-backwards
jQuery.fn.reverse = [].reverse;

Drupal.ajax.prototype.commands.viewsAutoRefreshIncremental = function (ajax, response, status) {
  var $view = $(response.selector);
  if (response.data) {
    // jQuery removes script tags, so let's mask them now and later unmask.
    // http://stackoverflow.com/questions/4430707/trying-to-select-script-tags-from-a-jquery-ajax-get-response/4432347#4432347
    response.data = response.data.replace(/<(\/?)script([^>]*)>/gi, '<$1scripttag$2>');

    var emptySelector = Drupal.settings.views_autorefresh[response.view_name].incremental.emptySelector || '.view-empty';
    var sourceSelector = Drupal.settings.views_autorefresh[response.view_name].incremental.sourceSelector || '.view-content';
    var $source = $(response.data).find(sourceSelector).not(sourceSelector + ' ' + sourceSelector).children();
    if ($source.size() > 0 && $(emptySelector, $source).size() <= 0) {
      var $target = $view.find(sourceSelector).not(sourceSelector + ' ' + sourceSelector);

      // If initial view was empty, remove the empty divs then add the target div.
      if ($target.size() == 0) {
        var afterSelector = Drupal.settings.views_autorefresh[response.view_name].incremental.afterSelector || '.view-header';
        var targetStructure = Drupal.settings.views_autorefresh[response.view_name].incremental.targetStructure || '<div class="view-content"></div>';
        if ($(emptySelector, $view).size() > 0) {
          // replace empty div with content.
          $(emptySelector, $view).replaceWith(targetStructure);
        }
        else if ($(afterSelector, $view).size() > 0) {
          // insert content after given div.
          $view.find(afterSelector).not(sourceSelector + ' ' + afterSelector).after(targetStructure);
        }
        else {
          // insert content as first child of view div.
          $view.prepend(targetStructure);
        }
        // Now that it's inserted, find it for manipulation.
        $target = $view.find(sourceSelector).not(sourceSelector + ' ' + sourceSelector);
      }

      // Remove first, last row classes from items.
      var firstClass = Drupal.settings.views_autorefresh[response.view_name].incremental.firstClass || 'views-row-first';
      var lastClass = Drupal.settings.views_autorefresh[response.view_name].incremental.lastClass || 'views-row-last';
      $target.children().removeClass(firstClass);
      $source.removeClass(lastClass);

      // Adjust even-odd classes.
      var oddClass = Drupal.settings.views_autorefresh[response.view_name].incremental.oddClass || 'views-row-odd';
      var evenClass = Drupal.settings.views_autorefresh[response.view_name].incremental.evenClass || 'views-row-even';
      var oddness = $target.children(':first').hasClass(oddClass);
      $source.filter('.' + oddClass + ', .' + evenClass).reverse().each(function() {
        $(this).removeClass(oddClass + ' ' + evenClass).addClass(oddness ? evenClass : oddClass);
        oddness = !oddness;
      });

      // Add the new items to the view.
      // Put scripts back first.
      $source.each(function() {
        $(this).addClass('views-autorefresh-new');
        $target.prepend($(this)[0].outerHTML.replace(/<(\/?)scripttag([^>]*)>/gi, '<$1script$2>'));
      });

      // Adjust row number classes.
      var rowClassPrefix = Drupal.settings.views_autorefresh[response.view_name].incremental.rowClassPrefix || 'views-row-';
      var rowRegex = new RegExp(rowClassPrefix + '(\\d+)');
      $target.children().each(function(i) {
        $(this).attr('class', $(this).attr('class').replace(rowRegex, rowClassPrefix + (i+1)));
      });

      // Trigger custom event on any plugin that needs to do extra work.
      $view.trigger('autorefresh_incremental', $source.size());
    }

    // Reactivate refresh timer if not using nodejs.
    if (!Drupal.settings.views_autorefresh[response.view_name].nodejs) {
      Drupal.views_autorefresh.timer(response.view_name, $('.auto-refresh a', $view), $view);
    }

    // Attach behaviors.
    Drupal.attachBehaviors($view);
  }
}

Drupal.Nodejs = Drupal.Nodejs || { callbacks: {} };

// Callback for nodejs message.
Drupal.Nodejs.callbacks.viewsAutoRefresh = {
  callback: function (message) {
    var view_name = message['view_name'];
    Drupal.views_autorefresh.refresh(
      view_name,
      Drupal.settings.views_autorefresh[view_name].anchor,
      Drupal.settings.views_autorefresh[view_name].target
    );
  }
};

// END jQuery
})(jQuery);
