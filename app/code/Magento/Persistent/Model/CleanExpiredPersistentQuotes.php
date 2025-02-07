<?php
/**
 * Copyright 2025 Adobe
 * All Rights Reserved.
 */
declare(strict_types=1);

namespace Magento\Persistent\Model;

use Magento\Framework\Exception\LocalizedException;
use Magento\Framework\Model\ResourceModel\Db\VersionControl\Snapshot;
use Magento\Store\Api\Data\StoreInterface;
use Magento\Store\Model\StoreManagerInterface;
use Magento\Persistent\Model\ResourceModel\ExpiredPersistentQuotesCollection;
use Magento\Quote\Model\QuoteRepository;
use Psr\Log\LoggerInterface;
use Exception;

/**
 * Cleaning expired persistent quotes from the cron
 */
class CleanExpiredPersistentQuotes
{
    /**
     * @param StoreManagerInterface $storeManager
     * @param ExpiredPersistentQuotesCollection $expiredPersistentQuotesCollection
     * @param QuoteRepository $quoteRepository
     * @param Snapshot $snapshot
     * @param LoggerInterface $logger
     */
    public function __construct(
        private readonly StoreManagerInterface $storeManager,
        private readonly ExpiredPersistentQuotesCollection $expiredPersistentQuotesCollection,
        private readonly QuoteRepository $quoteRepository,
        private Snapshot $snapshot,
        private readonly LoggerInterface $logger
    ) {
    }

    /**
     * Execute the cron job
     *
     * @param int $websiteId
     * @return void
     * @throws LocalizedException
     */
    public function execute(int $websiteId): void
    {
        $stores = $this->storeManager->getWebsite($websiteId)->getStores();
        foreach ($stores as $store) {
            $this->processStoreQuotes($store);
        }
    }

    /**
     * Process store quotes in batches
     *
     * @param StoreInterface $store
     * @return void
     */
    private function processStoreQuotes(StoreInterface $store): void
    {
        $batchSize = 500;
        $lastProcessedId = 0;

        while (true) {
            $quotesToProcess = $this->expiredPersistentQuotesCollection
                ->getExpiredPersistentQuotes($store, $lastProcessedId, $batchSize);

            if (!$quotesToProcess->count()) {
                break;
            }

            foreach ($quotesToProcess as $quote) {
                try {
                    $this->quoteRepository->delete($quote);
                    $lastProcessedId = (int)$quote->getId();
                } catch (Exception $e) {
                    $this->logger->error(sprintf(
                        'Unable to delete expired quote (ID: %s): %s',
                        $quote->getId(),
                        (string)$e
                    ));
                }
                $quote->clearInstance();
                unset($quote);
            }

            $quotesToProcess->clear();
            $this->snapshot->clear();
            unset($quotesToProcess);
        }
    }
}
