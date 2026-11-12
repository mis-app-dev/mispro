<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use RuntimeException;

abstract class TestCase extends BaseTestCase
{
    /**
     * Refuses to boot the tests against anything but a test database, so `php artisan test`
     * run on the server (or on a laptop whose .env points at the live database) fails
     * instead of reading or changing real data. This check runs before RefreshDatabase or
     * any other database trait.
     */
    public function createApplication()
    {
        $app = parent::createApplication();

        if ($app->configurationIsCached()) {
            throw new RuntimeException(
                'Tests refused: the configuration is cached (bootstrap/cache/config.php), so the '
                . 'settings in phpunit.xml are ignored. Run `php artisan config:clear` first.'
            );
        }

        $connection = $app['config']->get('database.default');
        $database = (string) $app['config']->get("database.connections.{$connection}.database");

        $isTestDatabase = $database === ':memory:' || preg_match('/_(test|testing)$/', $database) === 1;

        if (!$isTestDatabase) {
            throw new RuntimeException(
                "Tests refused: database '{$database}' is not a test database. Use a database whose "
                . "name ends with _test or _testing (e.g. DB_DATABASE=db_mis_test)."
            );
        }

        return $app;
    }
}
