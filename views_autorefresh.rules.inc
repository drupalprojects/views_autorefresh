<?php

/**
 * @file
 * Rules integration for the views_autorefresh module.
 */

/**
 * Implements hook_rules_action_info().
 */
function views_autorefresh_rules_action_info() {
  if (!module_exists('nodejs')) {
    return;
  }
  $items = array();
  $items['views_autorefresh'] = array(
    'label' => t('Autorefresh a View through Node.js'),
    'group' => t('Views Autorefresh'),
    'parameter' => array(
      'views' => array(
        'type' => 'list<integer>',
        'label' => t('Views'),
        'description' => t('Select one or more views that should refreshed.'),
        'options list' => 'views_autorefresh_get_nodejs_views',
      ),
    ),
    'base' => 'views_autorefresh_rules_process',
  );

  return $items;
}

/**
 * Action: Process and send message to nodejs.
 */
function views_autorefresh_rules_process($views) {
  views_autorefresh_nodejs_refresh($views);
}

/**
 * Helper function to get all views.
 */
function views_autorefresh_get_nodejs_views() {
  $eligible_views = array();
  foreach (views_get_enabled_views() as $view) {
    foreach ($view->display as $id => $display) {
      if ($display->display_plugin == 'default') continue;
      if (isset($display->display_options['header']) && empty($display->display_options['header']['autorefresh'])) continue;
      if (empty($display->display_options['header']) && empty($view->display['default']->display_options['header']['autorefresh'])) continue;
      $eligible_views[$view->name . '-' . $id] = $view->human_name . ' - ' . $display->display_title;
    }
  }
  natsort($eligible_views);
  return $eligible_views;
}
