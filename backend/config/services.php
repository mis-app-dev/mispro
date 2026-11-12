<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Mailgun, Postmark, AWS and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'token' => env('POSTMARK_TOKEN'),
    ],

    'resend' => [
        'key' => env('RESEND_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'sync' => [
        'api_key' => env('SYNC_API_KEY'),
        // Set to false only while a caller (the report card system) is being updated to
        // send the key. Calls without a valid key are then allowed but logged.
        'require_key' => (bool) env('SYNC_REQUIRE_KEY', true),
        // Optionally allow calls made directly on this server (loopback address, no proxy
        // headers) without a key. Off by default: in production every caller goes through
        // Cloudflare/Nginx and must send the key.
        'allow_local' => (bool) env('SYNC_ALLOW_LOCAL', false),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

];
