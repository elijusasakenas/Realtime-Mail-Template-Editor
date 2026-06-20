<?php declare(strict_types=1);

namespace RealtimeMailTemplateEditor\Controller\Api;

use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpFoundation\Request;
use Symfony\Component\HttpFoundation\Response;
use Symfony\Component\Routing\Attribute\Route;
use Twig\Environment;
use Twig\Error\Error;

#[Route(defaults: ['_routeScope' => ['api']])]
class MailTemplatePreviewController
{
    public function __construct(
        private readonly Environment $twig
    ) {
    }

    #[Route(
        path: '/api/_action/realtime-mail-template-editor/render',
        name: 'api.action.realtime_mail_template_editor.render',
        methods: ['POST'],
        defaults: ['_acl' => ['mail_template:read']]
    )]
    public function preview(Request $request): JsonResponse
    {
        $contentHtml = (string) $request->request->get('contentHtml', '');
        $contentPlain = (string) $request->request->get('contentPlain', '');
        $subject = (string) $request->request->get('subject', '');
        $senderName = (string) $request->request->get('senderName', '');

        try {
            return new JsonResponse([
                'data' => [
                    'subject' => $this->renderString($subject),
                    'senderName' => $this->renderString($senderName),
                    'contentHtml' => $this->renderString($contentHtml),
                    'contentPlain' => $this->renderString($contentPlain),
                ],
            ]);
        } catch (Error $exception) {
            return new JsonResponse([
                'errors' => [[
                    'status' => (string) Response::HTTP_BAD_REQUEST,
                    'title' => 'Template render failed',
                    'detail' => $exception->getMessage(),
                ]],
            ], Response::HTTP_BAD_REQUEST);
        }
    }

    private function renderString(string $template): string
    {
        if ($template === '') {
            return '';
        }

        return $this->twig->createTemplate($template)->render($this->getPreviewData());
    }

    /**
     * Sample data mirrors the variables most owners expect to see in common order/customer mails.
     *
     * @return array<string, mixed>
     */
    private function getPreviewData(): array
    {
        return [
            'salesChannel' => [
                'name' => 'Demo Store',
                'translated' => [
                    'name' => 'Demo Store',
                ],
                'domains' => [
                    [
                        'url' => 'https://example.com',
                    ],
                ],
            ],
            'customer' => [
                'firstName' => 'Alex',
                'lastName' => 'Miller',
                'email' => 'alex.miller@example.com',
                'company' => 'Miller Studio',
            ],
            'order' => [
                'orderNumber' => '10042',
                'deepLinkCode' => 'demo-order-link-10042',
                'amountTotal' => 149.9,
                'amountNet' => 125.97,
                'currency' => [
                    'isoCode' => 'EUR',
                    'symbol' => 'EUR',
                ],
                'orderCustomer' => [
                    'firstName' => 'Alex',
                    'lastName' => 'Miller',
                    'email' => 'alex.miller@example.com',
                    'salutation' => [
                        'translated' => [
                            'letterName' => 'Dear Alex',
                        ],
                    ],
                ],
                'deliveries' => [
                    [
                        'shippingMethod' => [
                            'translated' => [
                                'name' => 'Standard shipping',
                            ],
                        ],
                    ],
                ],
                'lineItems' => [
                    [
                        'label' => 'Everyday Backpack',
                        'quantity' => 1,
                        'unitPrice' => 89.95,
                        'totalPrice' => 89.95,
                    ],
                    [
                        'label' => 'Ceramic Coffee Cup',
                        'quantity' => 2,
                        'unitPrice' => 29.98,
                        'totalPrice' => 59.95,
                    ],
                ],
                'transactions' => [
                    [
                        'paymentMethod' => [
                            'translated' => [
                                'name' => 'Credit card',
                            ],
                        ],
                    ],
                ],
            ],
            'resetUrl' => 'https://example.com/account/recover',
            'url' => 'https://example.com',
            'context' => [
                'currency' => [
                    'isoCode' => 'EUR',
                    'symbol' => 'EUR',
                ],
            ],
        ];
    }
}
