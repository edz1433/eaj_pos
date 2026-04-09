<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="{{ ($appearance ?? 'system') === 'dark' ? 'dark' : '' }}" data-theme="{{ \App\Models\SystemSetting::get('general.color_theme', null, 'ea') }}">
    <head>
        <meta charset="utf-8">
        <meta name="csrf-token" content="{{ csrf_token() }}">
        <meta name="viewport" content="width=device-width, initial-scale=1">

        <title inertia>{{ config('app.name', 'EAJ') }}</title>

        <!-- Icons -->
        <link rel="icon" href="{{ asset('uploads/ease-icon.png') }}" sizes="any">
        <link rel="icon" href="{{ asset('uploads/ease-icon.png') }}" type="image/svg+xml">
        <link rel="apple-touch-icon" href="{{ asset('uploads/ease-icon.png') }}">

        <!-- Preconnect to Bunny Fonts (faster loading) -->
        <link rel="preconnect" href="https://fonts.bunny.net" crossorigin>
        <link href="https://fonts.bunny.net/css?family=instrument-sans:400,500,600" rel="stylesheet">

        <!-- Ziggy routes (important for route() in JS) -->
        @routes

        <!-- Vite + React Refresh + entry points -->
        @viteReactRefresh
        @vite([
            'resources/css/app.css',
            'resources/js/app.tsx',
        ])

        <!-- Inertia head (title, meta, links, scripts) -->
        @inertiaHead
    </head>

    <body class="font-sans antialiased bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 min-h-screen">
        @inertia
    </body>
</html>