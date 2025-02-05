<?php
/**
 * Copyright © Magento, Inc. All rights reserved.
 * See COPYING.txt for license details.
 */
declare(strict_types=1);

namespace Magento\Version\Controller\Index;

use Magento\Framework\App\Action\Action;
use Magento\Framework\App\Action\Context;
use Magento\Framework\App\Action\HttpGetActionInterface;
use Magento\Framework\App\DistributionMetadataInterface;
use Magento\Framework\App\ProductMetadataInterface;
use Magento\Framework\Controller\Result\RawFactory as RawResponseFactory;

/**
 * Magento Version controller: Sets the response body to ProductName/Major.MinorVersion (Edition).
 */
class Index extends Action implements HttpGetActionInterface
{
    public const DEV_PREFIX = 'dev-';

    /**
     * @var ProductMetadataInterface|DistributionMetadataInterface
     */
    private $productMetadata;

    /**
     * @var RawResponseFactory
     */
    private $rawFactory;

    /**
     * @param Context $context
     * @param RawResponseFactory $rawFactory
     * @param ProductMetadataInterface $productMetadata
     */
    public function __construct(
        Context $context,
        RawResponseFactory $rawFactory,
        ProductMetadataInterface $productMetadata
    ) {
        parent::__construct($context);
        $this->rawFactory = $rawFactory;
        $this->productMetadata = $productMetadata;
    }

    /**
     * @inheritDoc
     */
    public function execute()
    {
        $rawResponse = $this->rawFactory->create();

        $version = $this->productMetadata->getDistributionVersion() ?? '';
        $versionParts = explode('.', $version);
        if (!$this->isGitBasedInstallation($version) && $this->isCorrectVersion($versionParts)) {
            $rawResponse->setContents(
                $this->productMetadata->getDistributionName() . '/' .
                $this->getMajorMinorVersion($versionParts) .
                ' (' . $this->productMetadata->getEdition() . ')'
            );
        }

        return $rawResponse;
    }

    /**
     * Check if provided version is generated by Git-based Magento instance.
     *
     * @param string $fullVersion
     * @return bool
     */
    private function isGitBasedInstallation($fullVersion): bool
    {
        return 0 === strpos($fullVersion, self::DEV_PREFIX);
    }

    /**
     * Verifies if the Magento version is correct
     *
     * @param array $versionParts
     * @return bool
     */
    private function isCorrectVersion(array $versionParts): bool
    {
        return isset($versionParts[0]) && isset($versionParts[1]);
    }

    /**
     * Returns string only with Major and Minor version number
     *
     * @param array $versionParts
     * @return string
     */
    private function getMajorMinorVersion(array $versionParts): string
    {
        return $versionParts[0] . '.' . $versionParts[1];
    }
}
