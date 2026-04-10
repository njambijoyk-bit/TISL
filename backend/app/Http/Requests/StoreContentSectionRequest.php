<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreContentSectionRequest extends FormRequest
{
    // ─────────────────────────────────────────────────────────────
    // Section types that require each field
    // ─────────────────────────────────────────────────────────────

    private const REQUIRES_SUBTITLE = [
        'hero', 'mission_vision', 'values', 'team',
        'features', 'cta', 'contact_info', 'faq', 'rich_text',
    ];

    private const REQUIRES_ITEMS = [
        'values', 'features', 'stats', 'team',
        'gallery', 'faq', 'links', 'contact_info',
    ];

    // content required for these types regardless of page_type
    private const REQUIRES_CONTENT_ALWAYS = [
        'text', 'rich_text', 'mission_vision', 'cta',
    ];

    // image_url required only on homepage
    private const REQUIRES_IMAGE_ON_HOMEPAGE = ['hero', 'cta'];

    // image_url always allowed (not required, but validated when present)
    private const ALLOWS_IMAGE_ALWAYS = ['mission_vision'];

    // button_* required only on homepage
    private const REQUIRES_BUTTONS_ON_HOMEPAGE = ['hero'];

    // button_* required on ALL page types
    private const REQUIRES_BUTTONS_ALWAYS = ['cta'];

    // ─────────────────────────────────────────────────────────────

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $page        = $this->route('contentPage');
        $pageType    = $page?->page_type;
        $sectionType = $this->input('section_type');

        return [
            'section_key'  => [
                'required',
                'string',
                'max:100',
                'regex:/^[a-z0-9_]+$/',
                Rule::unique('content_sections')->where(
                    fn ($q) => $q->where('page_id', $page?->id)
                ),
            ],
            'section_type' => [
                'required',
                Rule::in([
                    'hero', 'text', 'mission_vision', 'values', 'features',
                    'stats', 'team', 'gallery', 'contact_info', 'faq',
                    'cta', 'links', 'rich_text', 'custom',
                ]),
            ],
            'title'        => 'required|string|max:255',
            'subtitle'     => $this->subtitleRule($sectionType),
            'content'      => $this->contentRule($sectionType, $pageType),
            'image_url'    => $this->imageUrlRule($sectionType, $pageType),
            'button_text'  => $this->buttonRule($sectionType, $pageType),
            'button_link'  => $this->buttonRule($sectionType, $pageType),
            'items'        => $this->itemsRule($sectionType),
            'settings'     => 'nullable|array',
            'sort_order'   => 'nullable|integer|min:0',
            'is_active'    => 'boolean',
        ];
    }

    // ─────────────────────────────────────────────────────────────
    // Field rule resolvers
    // ─────────────────────────────────────────────────────────────

    private function subtitleRule(?string $type): string
    {
        return in_array($type, self::REQUIRES_SUBTITLE)
            ? 'required|string|max:255'
            : 'nullable|string|max:255';
    }

    private function imageUrlRule(?string $type, ?string $pageType): string
    {
        $required = $pageType === 'homepage'
            && in_array($type, self::REQUIRES_IMAGE_ON_HOMEPAGE);

        // mission_vision + about hero: image_url is always accepted (nullable)
        // ALLOWS_IMAGE_ALWAYS covers mission_vision; about hero falls through to nullable below
        return $required ? 'required|string|max:500' : 'nullable|string|max:500';
    }

    private function contentRule(?string $type, ?string $pageType): string
    {
        $required = in_array($type, self::REQUIRES_CONTENT_ALWAYS)
            || ($type === 'hero' && $pageType === 'homepage');

        // about hero: content is accepted but optional
        return $required ? 'required|string' : 'nullable|string';
    }

    private function buttonRule(?string $type, ?string $pageType): string
    {
        $required = in_array($type, self::REQUIRES_BUTTONS_ALWAYS)
            || ($pageType === 'homepage' && in_array($type, self::REQUIRES_BUTTONS_ON_HOMEPAGE));

        // about hero: buttons accepted but optional
        return $required ? 'required|string|max:500' : 'nullable|string|max:500';
    }

    private function itemsRule(?string $type): string
    {
        return in_array($type, self::REQUIRES_ITEMS)
            ? 'required|array|min:1'
            : 'nullable|array';
    }

    // ─────────────────────────────────────────────────────────────
    // Items shape validation per section_type
    // ─────────────────────────────────────────────────────────────

    public function withValidator($validator): void
    {
        $validator->after(function ($v) {
            $type  = $this->input('section_type');
            $items = $this->input('items');

            if (!is_array($items) || empty($items)) {
                return;
            }

            match ($type) {
                'features', 'values' => $this->validateIconItems($v, $items),
                'stats'              => $this->validateStatsItems($v, $items),
                'team'               => $this->validateTeamItems($v, $items),
                'gallery'            => $this->validateGalleryItems($v, $items),
                'faq'                => $this->validateFaqItems($v, $items),
                'links'              => $this->validateLinksItems($v, $items),
                'contact_info'       => $this->validateContactInfoItems($v, $items),
                default              => null,
            };
        });
    }

    // [{title, description, icon}]
    private function validateIconItems($v, array $items): void
    {
        foreach ($items as $i => $item) {
            if (empty($item['title']))       $v->errors()->add("items.$i.title", 'Each item requires a title.');
            if (empty($item['description'])) $v->errors()->add("items.$i.description", 'Each item requires a description.');
            if (empty($item['icon']))        $v->errors()->add("items.$i.icon", 'Each item requires an icon.');
        }
    }

    // [{label, value}]
    private function validateStatsItems($v, array $items): void
    {
        foreach ($items as $i => $item) {
            if (empty($item['label'])) $v->errors()->add("items.$i.label", 'Each stat requires a label.');
            if (!isset($item['value'])) $v->errors()->add("items.$i.value", 'Each stat requires a value.');
        }
    }

    // [{name, role, image_url, bio}]
    private function validateTeamItems($v, array $items): void
    {
        foreach ($items as $i => $item) {
            if (empty($item['name']))      $v->errors()->add("items.$i.name", 'Each team member requires a name.');
            if (empty($item['role']))      $v->errors()->add("items.$i.role", 'Each team member requires a role.');
            if (empty($item['image_url'])) $v->errors()->add("items.$i.image_url", 'Each team member requires an image_url.');
            if (empty($item['bio']))       $v->errors()->add("items.$i.bio", 'Each team member requires a bio.');
        }
    }

    // [{url, caption}]
    private function validateGalleryItems($v, array $items): void
    {
        foreach ($items as $i => $item) {
            if (empty($item['url']))     $v->errors()->add("items.$i.url", 'Each gallery item requires a url.');
            if (empty($item['caption'])) $v->errors()->add("items.$i.caption", 'Each gallery item requires a caption.');
        }
    }

    // [{question, answer}]
    private function validateFaqItems($v, array $items): void
    {
        foreach ($items as $i => $item) {
            if (empty($item['question'])) $v->errors()->add("items.$i.question", 'Each FAQ item requires a question.');
            if (empty($item['answer']))   $v->errors()->add("items.$i.answer", 'Each FAQ item requires an answer.');
        }
    }

    // [{label, url, icon?}] — icon required for manual/links, optional for footer/links
    private function validateLinksItems($v, array $items): void
    {
        $pageType = $this->route('contentPage')?->page_type;

        foreach ($items as $i => $item) {
            if (empty($item['label'])) $v->errors()->add("items.$i.label", 'Each link requires a label.');
            if (empty($item['url']))   $v->errors()->add("items.$i.url", 'Each link requires a url.');
            if ($pageType === 'manual' && empty($item['icon'])) {
                $v->errors()->add("items.$i.icon", 'Each manual link requires an icon.');
            }
        }
    }

    // [{type, value, label}] — type must be one of the known contact types
    private function validateContactInfoItems($v, array $items): void
    {
        $allowedTypes = ['email', 'phone', 'address', 'hours', 'social'];

        foreach ($items as $i => $item) {
            if (empty($item['type']) || !in_array($item['type'], $allowedTypes)) {
                $v->errors()->add(
                    "items.$i.type",
                    'Contact type must be one of: ' . implode(', ', $allowedTypes) . '.'
                );
            }
            if (empty($item['value'])) $v->errors()->add("items.$i.value", 'Each contact item requires a value.');
            if (empty($item['label'])) $v->errors()->add("items.$i.label", 'Each contact item requires a label.');
        }
    }

    public function messages(): array
    {
        return [
            'section_key.regex'  => 'Section key may only contain lowercase letters, numbers, and underscores.',
            'section_key.unique' => 'This section key already exists on this page.',
            'items.min'          => 'At least one item is required for this section type.',
        ];
    }
}