<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Validator;

class Controller
{
    /**
     * Checks the query parameters of a list endpoint before they reach the query builder.
     * Returns a 422 response when a parameter has the wrong shape (e.g. search[]=x, sort=abc,
     * start_date=abc), or null when everything is fine.
     *
     * @param string[] $textKeys  parameters that must be plain text
     * @param string[] $dateKeys  parameters that must be a valid date
     * @param bool     $hasSort   whether the endpoint takes sort[n][field] / sort[n][order]
     */
    protected function invalidListQuery(Request $request, array $textKeys = [], array $dateKeys = [], bool $hasSort = false): ?JsonResponse
    {
        $rules = [];
        foreach ($textKeys as $key) {
            $rules[$key] = ['nullable', 'string', 'max:255'];
        }
        foreach ($dateKeys as $key) {
            $rules[$key] = ['nullable', 'date'];
        }
        if ($hasSort) {
            $rules['sort'] = ['nullable', 'array'];
            $rules['sort.*'] = ['array'];
            $rules['sort.*.field'] = ['nullable', 'string'];
            $rules['sort.*.order'] = ['nullable', 'string'];
        }

        $validator = Validator::make($request->query(), $rules);

        if ($validator->fails()) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid query parameters.',
                'errors'  => $validator->errors(),
            ], 422);
        }

        return null;
    }
}
