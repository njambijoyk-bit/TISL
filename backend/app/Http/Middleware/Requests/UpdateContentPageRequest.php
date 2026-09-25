<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateContentPageRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $pageId = $this->route('contentPage')?->id;

        return [
            'slug'        => [
                'sometimes',
                'string',
                'max:100',
                'regex:/^[a-z0-9\-]+$/',
                Rule::unique('content_pages', 'slug')->ignore($pageId),
            ],
            'title'       => 'sometimes|string|max:255',
            'description' => 'nullable|string',
            'page_type'   => [
                'sometimes',
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