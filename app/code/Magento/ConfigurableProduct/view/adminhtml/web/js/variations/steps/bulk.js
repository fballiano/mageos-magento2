/**
 * Copyright 2015 Adobe
 * All Rights Reserved.
 */

/* eslint-disable no-undef */

/* global FORM_KEY, byteConvert */
define([
    'uiComponent',
    'jquery',
    'ko',
    'underscore',
    'Magento_Ui/js/lib/collapsible',
    'mage/template',
    'Magento_Ui/js/modal/alert',
    'Magento_Catalog/js/product-gallery',
    'jquery/uppy-core',
    'mage/translate',
    'Magento_ConfigurableProduct/js/variations/variations'
], function (Component, $, ko, _, Collapsible, mageTemplate, alert) {
    'use strict';

    return Component.extend({
        defaults: {
            modules: {
                variationsComponent: '${ $.variationsComponent }'
            },
            countVariations: 0,
            attributes: [],
            sections: {},
            images: null,
            price: '',
            quantity: '',
            notificationMessage: {
                text: null,
                error: null
            },
            options: {
                isResizeEnabled: ''
            }
        },

        /** @inheritdoc */
        initObservable: function () {
            this._super().observe('countVariations attributes sections');

            return this;
        },

        /** @inheritdoc */
        initialize: function (config) {
            var self = this;

            this._super();
            this.sections({
                images: {
                    label: 'images',
                    type: ko.observable('none'),
                    value: ko.observable(),
                    attribute: ko.observable()
                },
                price: {
                    label: 'price',
                    type: ko.observable('none'),
                    value: ko.observable(),
                    attribute: ko.observable(),
                    currencySymbol: ''
                },
                quantity: {
                    label: 'quantity',
                    type: ko.observable('none'),
                    value: ko.observable(),
                    attribute: ko.observable()
                }
            });

            // Retrieve configuration passed from .phtml
            if (config) {
                this.options.isResizeEnabled = config.isResizeEnabled;
                this.options.maxWidth = config.maxWidth;
                this.options.maxHeight = config.maxHeight;
            }

            this.variationsComponent(function (variationsComponent) {
                this.sections().price.currencySymbol = variationsComponent.getCurrencySymbol();
            }.bind(this));

            /**
             * Make options sections.
             */
            this.makeOptionSections = function () {
                return {
                    images: new this.makeImages(null),
                    price: this.price,
                    quantity: this.quantity
                };
            }.bind(this);

            /**
             * @param {Object} images
             * @param {*} typePreview
             */
            this.makeImages = function (images, typePreview) {
                var preview;

                if (!images) {
                    this.images = [];
                    this.preview = self.noImage;
                    this.file = null;
                } else {
                    this.images = images;
                    preview = _.find(this.images, function (image) {
                        return _.contains(image.galleryTypes, typePreview);
                    });

                    if (preview) {
                        this.file = preview.file;
                        this.preview = preview.url;
                    } else {
                        this.file = null;
                        this.preview = self.noImage;
                    }
                }
            };
            this.images = new this.makeImages();
            _.each(this.sections(), function (section) {
                section.type.subscribe(function () {
                    this.setWizardNotifyMessageDependOnSectionType();
                }.bind(this));
            }, this);
        },
        types: ['each', 'single', 'none'],

        /**
         * Set Wizard notify message depend on section type
         */
        setWizardNotifyMessageDependOnSectionType: function () {
            var flag = false;

            _.each(this.sections(), function (section) {
                if (section.type() !== 'none') {
                    flag = true;
                }
            }, this);

            if (flag) {
                this.wizard.setNotificationMessage(
                    $.mage.__('Choose this option to delete and replace extension data for all past configurations.')
                );
            } else {
                this.wizard.cleanNotificationMessage();
            }
        },

        /**
         * @param {Object} wizard
         */
        render: function (wizard) {
            this.wizard = wizard;
            this.attributes(wizard.data.attributes());

            if (this.mode === 'edit') {
                this.setWizardNotifyMessageDependOnSectionType();
            }
            //fill option section data
            this.attributes.each(function (attribute) {
                attribute.chosen.each(function (option) {
                    option.sections = ko.observable(this.makeOptionSections());
                }, this);
            }, this);
            //reset section.attribute
            _.each(this.sections(), function (section) {
                section.attribute(null);
            });

            this.initCountVariations();
            this.bindGalleries();
            this.bindGalleries = this.bindGalleries.bind(this);
        },

        /**
         * Init count variations.
         */
        initCountVariations: function () {
            var variations = this.generateVariation(this.attributes()),
                newVariations = _.map(variations, function (options) {
                    return this.variationsComponent().getVariationKey(options);
                }.bind(this)),
                existingVariations = _.keys(this.variationsComponent().productAttributesMap);

            this.countVariations(_.difference(newVariations, existingVariations).length);
        },

        /**
         * @param {Object} attributes - example [['b1', 'b2'],['a1', 'a2', 'a3'],['c1', 'c2', 'c3'],['d1']]
         * @returns {*} example [['b1','a1','c1','d1'],['b1','a1','c2','d1']...]
         */
        generateVariation: function (attributes) {
            return _.reduce(attributes, function (matrix, attribute) {
                var tmp = [];

                _.each(matrix, function (variations) {
                    _.each(attribute.chosen, function (option) {
                        option['attribute_code'] = attribute.code;
                        option['attribute_label'] = attribute.label;
                        tmp.push(_.union(variations, [option]));
                    });
                });

                if (!tmp.length) {
                    return _.map(attribute.chosen, function (option) {
                        option['attribute_code'] = attribute.code;
                        option['attribute_label'] = attribute.label;

                        return [option];
                    });
                }

                return tmp;
            }, []);
        },

        /**
         * @param {*} section
         * @param {Object} options
         * @return {*}
         */
        getSectionValue: function (section, options) {
            switch (this.sections()[section].type()) {
            case 'each':
                return _.find(this.sections()[section].attribute().chosen, function (chosen) {
                    return _.find(options, function (option) {
                        return chosen.id == option.id; //eslint-disable-line eqeqeq
                    });
                }).sections()[section];

            case 'single':
                return this.sections()[section].value();

            case 'none':
                return this[section];
            }
        },

        /**
         * @param {*} node
         * @return {Promise|*}
         */
        getImageProperty: function (node) {
            var types = node.find('[data-role=gallery]').productGallery('option').types,
                images = _.map(node.find('[data-role=image]'), function (image) {
                    var imageData = $(image).data('imageData'),
                        positionElement;

                    imageData.galleryTypes = _.pluck(_.filter(types, function (type) {
                        return type.value === imageData.file;
                    }), 'code');

                    //jscs:disable requireCamelCaseOrUpperCaseIdentifiers
                    positionElement =
                        $(image).find('[name="product[media_gallery][images][' + imageData.file_id + '][position]"]');
                    //jscs:enable requireCamelCaseOrUpperCaseIdentifiers
                    if (!_.isEmpty(positionElement.val())) {
                        imageData.position = positionElement.val();
                    }

                    return imageData;
                });

            return _.reject(images, function (image) {
                return !!image.isRemoved;
            });
        },

        /**
         * Fill images section.
         */
        fillImagesSection: function () {
            switch (this.sections().images.type()) {
            case 'each':
                if (this.sections().images.attribute()) {
                    this.sections().images.attribute().chosen.each(function (option) {
                        option.sections().images = new this.makeImages(
                            this.getImageProperty($('[data-role=step-gallery-option-' + option.id + ']')),
                            'thumbnail'
                        );
                    }, this);
                }
                break;

            case 'single':
                this.sections().images.value(new this.makeImages(
                    this.getImageProperty($('[data-role=step-gallery-single]')),
                    'thumbnail'
                ));
                break;

            default:
                this.sections().images.value(new this.makeImages());
                break;
            }
        },

        /**
         * @param {Object} wizard
         */
        force: function (wizard) {
            this.fillImagesSection();
            this.validate();
            this.validateImage();
            wizard.data.sections = this.sections;
            wizard.data.sectionHelper = this.getSectionValue.bind(this);
            wizard.data.variations = this.generateVariation(this.attributes());
        },

        /**
         * Validate.
         */
        validate: function () {
            var formValid;

            _.each(this.sections(), function (section) {
                switch (section.type()) {
                case 'each':
                    if (!section.attribute()) {
                        throw new Error($.mage.__('Please select attribute for {section} section.')
                            .replace('{section}', section.label));
                    }
                    break;

                case 'single':
                    if (!section.value()) {
                        throw new Error($.mage.__('Please fill in the values for {section} section.')
                            .replace('{section}', section.label));
                    }
                    break;
                }
            }, this);
            formValid = true;
            _.each($('[data-role=attributes-values-form]'), function (form) {
                formValid = $(form).valid() && formValid;
            });

            if (!formValid) {
                throw new Error($.mage.__('Please fill-in correct values.'));
            }
        },

        /**
         * Validate image.
         */
        validateImage: function () {
            switch (this.sections().images.type()) {
            case 'each':
                _.each(this.sections().images.attribute().chosen, function (option) {
                    if (!option.sections().images.images.length) {
                        throw new Error($.mage.__('Please select image(s) for your attribute.'));
                    }
                });
                break;

            case 'single':
                if (this.sections().images.value().file == null) {
                    throw new Error($.mage.__('Please choose image(s).'));
                }
                break;
            }
        },

        /**
         * Back.
         */
        back: function () {
            this.setWizardNotifyMessageDependOnSectionType();
        },

        /**
         * Bind galleries.
         */
        bindGalleries: function () {
            var self = this; // Save the correct context of 'this'

            $('[data-role=bulk-step] [data-role=gallery]').each(function (index, element) {
                var gallery = $(element),
                    uploadInput = $(gallery.find('.uploader'))[0],
                    uploadUrl = $(gallery.find('.browse-file')).attr('data-url'),
                    dropZone = $(gallery).find('.image-placeholder')[0];

                if (!gallery.data('gallery-initialized')) {
                    gallery.mage('productGallery', {
                        template: '[data-template=gallery-content]',
                        dialogTemplate: '.dialog-template',
                        dialogContainerTmpl: '[data-role=img-dialog-container-tmpl]'
                    });

                    // uppy implementation
                    let targetElement = uploadInput,
                        fileId = null,
                        arrayFromObj = Array.from,
                        allowedExt = ['jpeg', 'jpg', 'png', 'gif'],
                        allowedResize = false,
                        options = {
                            proudlyDisplayPoweredByUppy: false,
                            target: targetElement,
                            hideUploadButton: true,
                            hideRetryButton: true,
                            hideCancelButton: true,
                            inline: true,
                            debug:true,
                            showRemoveButtonAfterComplete: true,
                            showProgressDetails: false,
                            showSelectedFiles: false,
                            allowMultipleUploads: false,
                            hideProgressAfterFinish: true
                        };

                    gallery.find('.product-image-wrapper').on('click', function () {
                        gallery.find('.uppy-Dashboard-browse').trigger('click');
                    });

                    const uppy = new Uppy.Uppy({
                        autoProceed: true,

                        onBeforeFileAdded: (currentFile) => {
                            let progressTmpl = mageTemplate('[data-template=uploader]'),
                                fileSize,
                                tmpl;

                            fileSize = typeof currentFile.size == 'undefined' ?
                                $.mage.__('We could not detect a size.') :
                                byteConvert(currentFile.size);

                            fileId = Math.random().toString(33).substr(2, 18);

                            tmpl = progressTmpl({
                                data: {
                                    name: currentFile.name,
                                    size: fileSize,
                                    id: fileId
                                }
                            });
                            // check if file is allowed to upload and resize
                            allowedResize = $.inArray(currentFile.extension?.toLowerCase(), allowedExt) !== -1;

                            // code to allow duplicate files from same folder
                            const modifiedFile = {
                                ...currentFile,
                                id:  currentFile.id + '-' + fileId,
                                tempFileId:  fileId
                            };

                            $(tmpl).appendTo(gallery.find('[data-role=uploader]'));
                            return modifiedFile;
                        },

                        meta: {
                            'form_key': FORM_KEY
                        }
                    });

                    // initialize Uppy upload
                    uppy.use(Uppy.Dashboard, options);
                    // Use 'self.options' to access component options
                    self.options = self.options || {};

                    if (self.options.isResizeEnabled ?? false) {
                        uppy.use(Uppy.Compressor, {
                            maxWidth: self.options.maxWidth,
                            maxHeight: self.options.maxHeight,
                            quality: 0.92,
                            beforeDraw() {
                                if (!allowedResize) {
                                    this.abort();
                                }
                            }
                        });
                    }

                    // drop area for file upload
                    uppy.use(Uppy.DropTarget, {
                        target: dropZone,
                        onDragOver: () => {
                            // override Array.from method of legacy-build.min.js file
                            Array.from = null;
                        },
                        onDragLeave: () => {
                            Array.from = arrayFromObj;
                        }
                    });

                    // upload files on server
                    uppy.use(Uppy.XHRUpload, {
                        endpoint: uploadUrl,
                        fieldName: 'image'
                    });
                    uppy.on('upload-success', (file, response) => {
                        if (response.body && !response.body.error) {
                            gallery.trigger('addItem', response.body);
                        } else {
                            $('#' + file.tempFileId)
                                .delay(2000)
                                .hide('highlight');
                            alert({
                                content: $.mage.__('We don\'t recognize or support this file extension type.')
                            });
                        }
                        $('#' + file.tempFileId).remove();
                    });

                    uppy.on('upload-progress', (file, progress) => {
                        let progressWidth = parseInt(progress.bytesUploaded / progress.bytesTotal * 100, 10),
                            progressSelector = '#' + file.tempFileId + ' .progressbar-container .progressbar';

                        $(progressSelector).css('width', progressWidth + '%');
                    });

                    uppy.on('upload-error', (error, file) => {
                        let progressSelector = '#' + file.tempFileId;

                        $(progressSelector).removeClass('upload-progress').addClass('upload-failure')
                            .delay(2000)
                            .hide('highlight')
                            .remove();
                    });

                    uppy.on('complete', () => {
                        Array.from = arrayFromObj;
                    });

                    gallery.data('gallery-initialized', 1);
                }
            });
        }
    });
});
