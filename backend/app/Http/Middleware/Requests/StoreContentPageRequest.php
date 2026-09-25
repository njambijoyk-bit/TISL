<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreContentPageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'slug'        => [
                'required',
                'string',
                'max:100',
                'regex:/^[a-z0-9\-]+$/',
                'unique:content_pages,slug',
            ],
            'title'       => 'required|string|max:255',
            'description' => 'nullable|string',
            'page_type'   => [
                'required',
                Rule::in(['about', 'contact', 'manual', 'homepage', 'footer', 'custom']),
            ],
            'is_active'   => 'boolean',
            'metadata'    => 'nullable|array',
        ];
    }

    public function messages(): array
    {
        return [
            'slug.regex'  => 'Slug may only contain lowercase letters, numbers, and hyphens.',
            'slug.unique' => 'A page with this slug already exists.',
        ];
    }
}