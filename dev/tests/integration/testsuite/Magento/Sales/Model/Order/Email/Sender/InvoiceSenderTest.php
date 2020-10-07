<?php
/**
 * Copyright © Magento, Inc. All rights reserved.
 * See COPYING.txt for license details.
 */
declare(strict_types=1);

namespace Magento\Sales\Model\Order\Email\Sender;

use Magento\Customer\Api\CustomerRepositoryInterface;
use Magento\Customer\Model\ResourceModel\CustomerRepository;
use Magento\Framework\App\Area;
use Magento\Framework\ObjectManagerInterface;
use Magento\Sales\Api\Data\InvoiceInterface;
use Magento\Sales\Api\Data\InvoiceInterfaceFactory;
use Magento\Sales\Api\Data\OrderInterfaceFactory;
use Magento\Sales\Model\Order;
use Magento\Sales\Model\Order\Email\Container\InvoiceIdentity;
use Magento\Sales\Model\Order\Invoice;
use Magento\TestFramework\Helper\Bootstrap;
use Magento\TestFramework\Mail\Template\TransportBuilderMock;
use PHPUnit\Framework\TestCase;

/**
 * Checks the sending of order invoice email to the customer.
 *
 * @see \Magento\Sales\Model\Order\Email\Sender\InvoiceSender
 * @SuppressWarnings(PHPMD.CouplingBetweenObjects)
 */
class InvoiceSenderTest extends TestCase
{
    const NEW_CUSTOMER_EMAIL = 'new.customer@example.com';
    const OLD_CUSTOMER_EMAIL = 'customer@null.com';
    const ORDER_EMAIL = 'customer@null.com';

    /** @var ObjectManagerInterface */
    private $objectManager;

    /** @var CustomerRepository */
    private $customerRepository;

    /** @var InvoiceSender */
    private $invoiceSender;

    /** @var TransportBuilderMock */
    private $transportBuilderMock;

    /** @var OrderInterfaceFactory */
    private $orderFactory;

    /** @var InvoiceInterfaceFactory */
    private $invoiceFactory;

    /** @var InvoiceIdentity */
    private $invoiceIdentity;

    /**
     * @inheritdoc
     */
    protected function setUp(): void
    {
        parent::setUp();
        $this->objectManager = Bootstrap::getObjectManager();
        $this->customerRepository = $this->objectManager->get(CustomerRepositoryInterface::class);
        $this->invoiceSender = $this->objectManager->get(InvoiceSender::class);
        $this->transportBuilderMock = $this->objectManager->get(TransportBuilderMock::class);
        $this->orderFactory = $this->objectManager->get(OrderInterfaceFactory::class);
        $this->invoiceFactory = $this->objectManager->get(InvoiceInterfaceFactory::class);
        $this->invoiceIdentity = $this->objectManager->get(InvoiceIdentity::class);
    }

    /**
     * @magentoDataFixture Magento/Sales/_files/order.php
     * @return void
     */
    public function testSend(): void
    {
        Bootstrap::getInstance()->loadArea(Area::AREA_FRONTEND);
        $order = $this->getOrder('100000001');
        $order->setCustomerEmail('customer@example.com');
        $invoice = $this->createInvoice($order);
        $invoice->setTotalQty(1);
        $invoice->setBaseSubtotal(50);
        $invoice->setBaseTaxAmount(10);
        $invoice->setBaseShippingAmount(5);

        $this->assertEmpty($invoice->getEmailSent());
        $result = $this->invoiceSender->send($invoice, true);

        $this->assertTrue($result);
        $this->assertNotEmpty($invoice->getEmailSent());
        $this->assertEquals($invoice->getBaseSubtotal(), $order->getBaseSubtotal());
        $this->assertEquals($invoice->getBaseTaxAmount(), $order->getBaseTaxAmount());
        $this->assertEquals($invoice->getBaseShippingAmount(), $order->getBaseShippingAmount());
    }

    /**
     * Test that when a customer email is modified, the invoice is sent to the new email
     *
     * @magentoDataFixture Magento/Sales/_files/order_with_customer.php
     * @magentoAppArea frontend
     * @return void
     */
    public function testSendWhenCustomerEmailWasModified(): void
    {
        $customer = $this->customerRepository->getById(1);
        $customer->setEmail(self::NEW_CUSTOMER_EMAIL);
        $this->customerRepository->save($customer);
        $order = $this->getOrder('100000001');
        $invoice = $this->createInvoice($order);

        $this->assertEmpty($invoice->getEmailSent());
        $result = $this->invoiceSender->send($invoice, true);

        $this->assertEquals(self::NEW_CUSTOMER_EMAIL, $this->invoiceIdentity->getCustomerEmail());
        $this->assertTrue($result);
        $this->assertNotEmpty($invoice->getEmailSent());
    }

    /**
     * Test that when a customer email is not modified, the invoice is sent to the old customer email
     *
     * @magentoDataFixture Magento/Sales/_files/order_with_customer.php
     * @magentoAppArea frontend
     * @return void
     */
    public function testSendWhenCustomerEmailWasNotModified(): void
    {
        $order = $this->getOrder('100000001');
        $invoice = $this->createInvoice($order);

        $this->assertEmpty($invoice->getEmailSent());
        $result = $this->invoiceSender->send($invoice, true);

        $this->assertEquals(self::OLD_CUSTOMER_EMAIL, $this->invoiceIdentity->getCustomerEmail());
        $this->assertTrue($result);
        $this->assertNotEmpty($invoice->getEmailSent());
    }

    /**
     * Test that when an order has not customer the invoice is sent to the order email
     *
     * @magentoDataFixture Magento/Sales/_files/order.php
     * @magentoAppArea frontend
     * @return void
     */
    public function testSendWithoutCustomer(): void
    {
        $order = $this->getOrder('100000001');
        $invoice = $this->createInvoice($order);

        $this->assertEmpty($invoice->getEmailSent());
        $result = $this->invoiceSender->send($invoice, true);

        $this->assertEquals(self::ORDER_EMAIL, $this->invoiceIdentity->getCustomerEmail());
        $this->assertTrue($result);
        $this->assertNotEmpty($invoice->getEmailSent());
    }

    /**
     * @magentoDataFixture Magento/Sales/_files/invoice.php
     * @magentoConfigFixture default/sales_email/general/async_sending 1
     * @return void
     */
    public function testSendWithAsyncSendingEnabled(): void
    {
        $order = $this->getOrder('100000001');
        /** @var Invoice $invoice */
        $invoice = $order->getInvoiceCollection()
            ->addAttributeToFilter(InvoiceInterface::ORDER_ID, $order->getID())
            ->getFirstItem();
        $result = $this->invoiceSender->send($invoice);
        $this->assertFalse($result);
        $invoice = $order->getInvoiceCollection()->clear()->getFirstItem();
        $this->assertEmpty($invoice->getEmailSent());
        $this->assertEquals('1', $invoice->getSendEmail());
        $this->assertNull(
            $this->transportBuilderMock->getSentMessage(),
            'The message is not expected to be received.'
        );
    }

    /**
     * Create invoice and set order
     *
     * @param Order $order
     * @return Invoice
     */
    private function createInvoice(Order $order): Invoice
    {
        /** @var Invoice $invoice */
        $invoice = $this->invoiceFactory->create();
        $invoice->setOrder($order);

        return $invoice;
    }

    /**
     * Get order by increment_id
     *
     * @param string $incrementId
     * @return Order
     */
    private function getOrder(string $incrementId): Order
    {
        return $this->orderFactory->create()->loadByIncrementId($incrementId);
    }
}
