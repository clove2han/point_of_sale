
// this file contains the screens definitions. Screens are the
// content of the right pane of the pos, containing the main functionalities. 
// screens are contained in the PosWidget, in pos_widget.js
// all screens are present in the dom at all time, but only one is shown at the
// same time. 
//
// transition between screens is made possible by the use of the screen_selector,
// which is responsible of hiding and showing the screens, as well as maintaining
// the state of the screens between different orders.
//
// all screens inherit from ScreenWidget. the only addition from the base widgets
// are show() and hide() which shows and hides the screen but are also used to 
// bind and unbind actions on widgets and devices. The screen_selector guarantees
// that only one screen is shown at the same time and that show() is called after all
// hide()s

function openerp_pos_screens(instance, module){ //module is instance.point_of_sale
    var QWeb = instance.web.qweb,
    _t = instance.web._t;

    module.ScreenSelector = instance.web.Class.extend({
        init: function(options){
            this.pos = options.pos;

            this.screen_set = options.screen_set || {};

            this.popup_set = options.popup_set || {};

            this.default_client_screen = options.default_client_screen;
            this.default_cashier_screen = options.default_cashier_screen;

            this.current_popup = null;

            this.current_mode = options.default_mode || 'client';

            this.current_screen = null; 

            for(screen_name in this.screen_set){
                this.screen_set[screen_name].hide();
            }
            
            for(popup_name in this.popup_set){
                this.popup_set[popup_name].hide();
            }

            this.selected_order = this.pos.get('selectedOrder');
            this.selected_order.set_screen_data({
                client_screen: this.default_client_screen,
                cashier_screen: this.default_cashier_screen,
            });

            this.pos.bind('change:selectedOrder', this.load_saved_screen, this);
        },
        add_screen: function(screen_name, screen){
            screen.hide();
            this.screen_set[screen_name] = screen;
            return this;
        },
        show_popup: function(name){
            if(this.current_popup){
                this.close_popup();
            }
            this.current_popup = this.popup_set[name];
            this.current_popup.show();
        },
        close_popup: function(){
            if(this.current_popup){
                this.current_popup.close();
                this.current_popup.hide();
                this.current_popup = null;
            }
        },
        load_saved_screen:  function(){
            this.close_popup();

            var selectedOrder = this.pos.get('selectedOrder');
            
            if(this.current_mode === 'client'){
                this.set_current_screen(selectedOrder.get_screen_data('client_screen') || this.default_client_screen,null,'refresh');
            }else if(this.current_mode === 'cashier'){
                this.set_current_screen(selectedOrder.get_screen_data('cashier_screen') || this.default_cashier_screen,null,'refresh');
            }
            this.selected_order = selectedOrder;
        },
        set_user_mode: function(user_mode){
            if(user_mode !== this.current_mode){
                this.close_popup();
                this.current_mode = user_mode;
                this.load_saved_screen();
            }
        },
        get_user_mode: function(){
            return this.current_mode;
        },
        set_current_screen: function(screen_name,params,refresh){
            var screen = this.screen_set[screen_name];
            if(!screen){
                console.error("ERROR: set_current_screen("+screen_name+") : screen not found");
            }

            this.close_popup();
            var selectedOrder = this.pos.get('selectedOrder');
            if(this.current_mode === 'client'){
                selectedOrder.set_screen_data('client_screen',screen_name);
                if(params){ 
                    selectedOrder.set_screen_data('client_screen_params',params); 
                }
            }else{
                selectedOrder.set_screen_data('cashier_screen',screen_name);
                if(params){
                    selectedOrder.set_screen_data('cashier_screen_params',params);
                }
            }

            if(screen && (refresh || screen !== this.current_screen)){
                if(this.current_screen){
                    this.current_screen.close();
                    this.current_screen.hide();
                }
                this.current_screen = screen;
                this.current_screen.show();
            }
        },
        get_current_screen_param: function(param){
            var selected_order = this.pos.get('selectedOrder');
            if(this.current_mode === 'client'){
                var params = selected_order.get_screen_data('client_screen_params');
            }else{
                var params = selected_order.get_screen_data('cashier_screen_params');
            }
            if(params){
                return params[param];
            }else{
                return undefined;
            }
        },
        set_default_screen: function(){
            this.set_current_screen(this.current_mode === 'client' ? this.default_client_screen : this.default_cashier_screen);
        },
    });

    module.ScreenWidget = module.PosBaseWidget.extend({

        show_numpad:     true,  
        show_leftpane:   true,

        init: function(parent,options){
            this._super(parent,options);
            this.hidden = false;

        },

        help_button_action: function(){
            this.pos_widget.screen_selector.show_popup('help');
        },

        barcode_product_screen:         'products',     //if defined, this screen will be loaded when a product is scanned
        barcode_product_error_popup:    'error-product',    //if defined, this popup will be loaded when there's an error in the popup

        hotkeys_handlers: {},

        // what happens when a product is scanned : 
        // it will add the product to the order and go to barcode_product_screen. Or show barcode_product_error_popup if 
        // there's an error.
        barcode_product_action: function(code){
            var self = this;
            if(self.pos.scan_product(code)){
                self.pos.proxy.scan_item_success(code);
                if(self.barcode_product_screen){ 
                    self.pos_widget.screen_selector.set_current_screen(self.barcode_product_screen);
                }
            }else{
                self.pos.proxy.scan_item_error_unrecognized(code);
                if(self.barcode_product_error_popup && self.pos_widget.screen_selector.get_user_mode() !== 'cashier'){
                    self.pos_widget.screen_selector.show_popup(self.barcode_product_error_popup);
                }
            }
        },

        // what happens when a cashier id barcode is scanned.
        // the default behavior is the following : 
        // - if there's a user with a matching ean, put it as the active 'cashier', go to cashier mode, and return true
        // - else : do nothing and return false. You probably want to extend this to show and appropriate error popup... 
        barcode_cashier_action: function(code){
            var users = this.pos.users;
            for(var i = 0, len = users.length; i < len; i++){
                if(users[i].ean13 === code.code){
                    this.pos.cashier = users[i];
                    this.pos_widget.username.refresh();
                    this.pos.proxy.cashier_mode_activated();
                    this.pos_widget.screen_selector.set_user_mode('cashier');
                    return true;
                }
            }
            this.pos.proxy.scan_item_error_unrecognized(code);
            return false;
        },

         //计算消费积分
        calclate_point:function(){
            var currentOrder = this.pos.get('selectedOrder');           
            var paid_total = currentOrder.get_all_discMoney();             
            var add_point_without_member = currentOrder.get_add_point() - currentOrder.get_point_by_code('tvip');
          
            if(add_point_without_member > 0){
                this.rpc('/vip_membership/member_sale_points',{'args':{ 'member_id': member_id,
                                                                        'last_money': paid_total,
                                                                        'points':add_point_without_member,
                                                                        'name':this.pos.config.id}})
                    .then(function(trans){
                        if(!trans.flag){
                         alert(trans.info);
                        }                
                });
            }
        },
        

        //绑定事件，该函数主要是防止重复绑定
        bind_event: function($element, event_name, func){
            $element.unbind(event_name);
            $element.bind(event_name, func);
        },

        validate_push_order: function(){
           
            var self = this;
            var currentOrder = this.pos.get('selectedOrder');
            var paymentlines   = currentOrder.get('paymentLines').models;
            var next_screen_dict = {
                'tvip': 'validatemember',
                'twwx': 'weixinnativepay',
                'tbnk': 'client_payment',
            }

            if(    self.pos.config.iface_cashdrawer 
                && self.pos.get('selectedOrder').get('paymentLines').find( function(pl){ 
                           return pl.cashregister.journal.type === 'cash'; 
                   })){
                    self.pos.proxy.open_cashbox();
            }

            for (var i = 0; i < paymentlines.length; i++) {
                if(paymentlines[i].get_code().toLowerCase() == 'tcsh') {
                    paymentlines[i].set_paid(true);
                }else{
                        
                    if(!paymentlines[i].get_paid() && 0 != currentOrder.get_paymentline_amount(paymentlines[i].get_code().toLowerCase())){     
                        
                        this.pos_widget.screen_selector.set_current_screen(next_screen_dict[paymentlines[i].get_code().toLowerCase()]);
                        return 
                    }
                }

            }
            
            self.pos.push_order(currentOrder);
            
            if(currentOrder.get_member()){
                self.calclate_point();
            }
                

            if(self.pos.config.iface_print_via_proxy){
                var receipt = currentOrder.export_for_printing();
                self.pos.proxy.print_receipt(QWeb.render('XmlReceipt',{
                    receipt: receipt
                }));
                self.pos.get('selectedOrder').destroy();    //finish order and go back to scan screen
            }else{
                self.pos_widget.screen_selector.set_current_screen('receipt');
            }       
        },
        
        // what happens when a client id barcode is scanned.
        // the default behavior is the following : 
        // - if there's a user with a matching ean, put it as the active 'client' and return true
        // - else : return false. 
        barcode_client_action: function(code){
            var partners = this.pos.partners;
            for(var i = 0, len = partners.length; i < len; i++){
                if(partners[i].ean13 === code.code){
                    this.pos.get('selectedOrder').set_client(partners[i]);
                    this.pos_widget.username.refresh();
                    this.pos.proxy.scan_item_success(code);
                    return true;
                }
            }
            this.pos.proxy.scan_item_error_unrecognized(code);
            return false;
            //TODO start the transaction
        },
        
        // what happens when a discount barcode is scanned : the default behavior
        // is to set the discount on the last order.
        barcode_discount_action: function(code){
            this.pos.proxy.scan_item_success(code);
            var last_orderline = this.pos.get('selectedOrder').getLastOrderline();
            if(last_orderline){
                last_orderline.set_discount(code.value)
            }
        },

        // shows an action bar on the screen. The actionbar is automatically shown when you add a button
        // with add_action_button()
        show_action_bar: function(){
            this.pos_widget.action_bar.show();
        },

        // hides the action bar. The actionbar is automatically hidden when it is empty
        hide_action_bar: function(){
            this.pos_widget.action_bar.hide();
        },

        // adds a new button to the action bar. The button definition takes three parameters, all optional :
        // - label: the text below the button
        // - icon:  a small icon that will be shown
        // - click: a callback that will be executed when the button is clicked.
        // the method returns a reference to the button widget, and automatically show the actionbar.
        add_action_button: function(button_def){
            this.show_action_bar();
            return this.pos_widget.action_bar.add_new_button(button_def);
        },

        // this method shows the screen and sets up all the widget related to this screen. Extend this method
        // if you want to alter the behavior of the screen.
        show: function(){
            var self = this;

            this.hidden = false;
            if(this.$el){
                this.$el.removeClass('oe_hidden');
            }

            if(this.pos_widget.action_bar.get_button_count() > 0){
                this.show_action_bar();
            }else{
                this.hide_action_bar();
            }
            
            // we add the help button by default. we do this because the buttons are cleared on each refresh so that
            // the button stay local to each screen
            this.pos_widget.left_action_bar.add_new_button({
                    label: _t('Help'),
                    icon: '/point_of_sale/static/src/img/icons/png48/help.png',
                    click: function(){ self.help_button_action(); },
                });

            var self = this;
            this.cashier_mode = this.pos_widget.screen_selector.get_user_mode() === 'cashier';

            this.pos_widget.set_numpad_visible(this.show_numpad && this.cashier_mode);
            this.pos_widget.set_leftpane_visible(this.show_leftpane);
            this.pos_widget.set_left_action_bar_visible(this.show_leftpane && !this.cashier_mode);
            this.pos_widget.set_cashier_controls_visible(this.cashier_mode);

            if(this.cashier_mode && this.pos.config.iface_self_checkout){
                this.pos_widget.client_button.show();
            }else{
                this.pos_widget.client_button.hide();
            }
            if(this.cashier_mode){
                this.pos_widget.close_button.show();
            }else{
                this.pos_widget.close_button.hide();
            }
            
            this.pos_widget.username.set_user_mode(this.pos_widget.screen_selector.get_user_mode());

            this.pos.barcode_reader.set_action_callback({
                'cashier': self.barcode_cashier_action ? function(code){ self.barcode_cashier_action(code); } : undefined ,
                'product': self.barcode_product_action ? function(code){ self.barcode_product_action(code); } : undefined ,
                'client' : self.barcode_client_action ?  function(code){ self.barcode_client_action(code);  } : undefined ,
                'discount': self.barcode_discount_action ? function(code){ self.barcode_discount_action(code); } : undefined,
            });
        },

        // this method is called when the screen is closed to make place for a new screen. this is a good place
        // to put your cleanup stuff as it is guaranteed that for each show() there is one and only one close()
        close: function(){
            if(this.pos.barcode_reader){
                this.pos.barcode_reader.reset_action_callbacks();
            }
            this.pos_widget.action_bar.destroy_buttons();
            this.pos_widget.left_action_bar.destroy_buttons();
        },

        // this methods hides the screen. It's not a good place to put your cleanup stuff as it is called on the
        // POS initialization.
        hide: function(){
            this.hidden = true;
            if(this.$el){
                this.$el.addClass('oe_hidden');
            }
        },

        // we need this because some screens re-render themselves when they are hidden
        // (due to some events, or magic, or both...)  we must make sure they remain hidden.
        // the good solution would probably be to make them not re-render themselves when they
        // are hidden. 
        renderElement: function(){
            this._super();
            if(this.hidden){
                if(this.$el){
                    this.$el.addClass('oe_hidden');
                }
            }
        },
    });

    module.PopUpWidget = module.PosBaseWidget.extend({
        show: function(){
            if(this.$el){
                this.$el.removeClass('oe_hidden');
            }
        },
        /* called before hide, when a popup is closed */
        close: function(){
        },
        /* hides the popup. keep in mind that this is called in the initialization pass of the 
         * pos instantiation, so you don't want to do anything fancy in here */
        hide: function(){
            if(this.$el){
                this.$el.addClass('oe_hidden');
            }
        },
    });

    module.HelpPopupWidget = module.PopUpWidget.extend({
        template:'HelpPopupWidget',
        show: function(){
            this._super();
            this.pos.proxy.help_needed();
            var self = this;
            
            this.$el.find('.button').off('click').click(function(){
                self.pos_widget.screen_selector.close_popup();
            });
        },
        close:function(){
            this.pos.proxy.help_canceled();
        },
    });

    module.ChooseReceiptPopupWidget = module.PopUpWidget.extend({
        template:'ChooseReceiptPopupWidget',
        show: function(){
            this._super();
            this.renderElement();
            var self = this;
            var currentOrder = self.pos.get('selectedOrder');
            
            this.$('.button.receipt').off('click').click(function(){
                currentOrder.set_receipt_type('receipt');
                self.pos_widget.screen_selector.set_current_screen('products');
            });

            this.$('.button.invoice').off('click').click(function(){
                currentOrder.set_receipt_type('invoice');
                self.pos_widget.screen_selector.set_current_screen('products');
            });
        },
        get_client_name: function(){
            var client = this.pos.get('selectedOrder').get_client();
            if( client ){
                return client.name;
            }else{
                return '';
            }
        },
    });

    module.ErrorPopupWidget = module.PopUpWidget.extend({
        template:'ErrorPopupWidget',
        show: function(){
            var self = this;
            this._super();
            this.pos.proxy.help_needed();
            this.pos.proxy.scan_item_error_unrecognized();

            this.pos.barcode_reader.save_callbacks();
            this.pos.barcode_reader.reset_action_callbacks();
            this.pos.barcode_reader.set_action_callback({
                'cashier': function(code){
                    clearInterval(this.intervalID);
                    self.pos.proxy.cashier_mode_activated();
                    self.pos_widget.screen_selector.set_user_mode('cashier');
                },
            });
            this.$('.footer .button').off('click').click(function(){
                self.pos_widget.screen_selector.close_popup();
            });
        },
        close:function(){
            this._super();
            this.pos.proxy.help_canceled();
            this.pos.barcode_reader.restore_callbacks();
        },
    });

    module.ProductErrorPopupWidget = module.ErrorPopupWidget.extend({
        template:'ProductErrorPopupWidget',
    });

    module.ErrorSessionPopupWidget = module.ErrorPopupWidget.extend({
        template:'ErrorSessionPopupWidget',
    });

    module.ErrorNegativePricePopupWidget = module.ErrorPopupWidget.extend({
        template:'ErrorNegativePricePopupWidget',
    });

    module.ErrorNoClientPopupWidget = module.ErrorPopupWidget.extend({
        template: 'ErrorNoClientPopupWidget',
    });

    module.ErrorInvoiceTransferPopupWidget = module.ErrorPopupWidget.extend({
        template: 'ErrorInvoiceTransferPopupWidget',
    });
                
    module.ScaleInviteScreenWidget = module.ScreenWidget.extend({
        template:'ScaleInviteScreenWidget',

        next_screen:'scale',
        previous_screen:'products',

        show: function(){
            this._super();
            var self = this;
            var queue = this.pos.proxy_queue;

            queue.schedule(function(){
                return self.pos.proxy.weighting_start();
            },{ important: true });
            
            queue.schedule(function(){
                return self.pos.proxy.weighting_read_kg().then(function(weight){
                    if(weight > 0.001){
                        self.pos_widget.screen_selector.set_current_screen(self.next_screen);
                    }
                });
            },{duration: 100, repeat: true});

            this.add_action_button({
                    label: _t('Back'),
                    icon: '/point_of_sale/static/src/img/icons/png48/go-previous.png',
                    click: function(){  
                        self.pos_widget.screen_selector.set_current_screen(self.previous_screen);
                    }
                });
        },
        close: function(){
            this._super();
            var self = this;
            this.pos.proxy_queue.clear();
            this.pos.proxy_queue.schedule(function(){
                return self.pos.proxy.weighting_end();
            },{ important: true });
        },
    });

    module.ScaleScreenWidget = module.ScreenWidget.extend({
        template:'ScaleScreenWidget',

        next_screen: 'products',
        previous_screen: 'products',

        show: function(){
            this._super();
            var self = this;
            var queue = this.pos.proxy_queue;

            this.set_weight(0);
            this.renderElement();

            this.hotkey_handler = function(event){
                if(event.which === 13){
                    self.order_product();
                    self.pos_widget.screen_selector.set_current_screen(self.next_screen);
                }else if(event.which === 27){
                    self.pos_widget.screen_selector.set_current_screen(self.previous_screen);
                }
            };

            $('body').on('keyup',this.hotkey_handler);

            this.add_action_button({
                    label: _t('Back'),
                    icon: '/point_of_sale/static/src/img/icons/png48/go-previous.png',
                    click: function(){
                        self.pos_widget.screen_selector.set_current_screen(self.previous_screen);
                    }
                });

            this.validate_button = this.add_action_button({
                    label: _t('Validate'),
                    icon: '/point_of_sale/static/src/img/icons/png48/validate.png',
                    click: function(){
                        self.order_product();
                        self.pos_widget.screen_selector.set_current_screen(self.next_screen);
                    },
                });
            
            queue.schedule(function(){
                return self.pos.proxy.weighting_start()
            },{ important: true });
            
            queue.schedule(function(){
                return self.pos.proxy.weighting_read_kg().then(function(weight){
                    self.set_weight(weight);
                });
            },{duration:50, repeat: true});

        },
        renderElement: function(){
            var self = this;
            this._super();
            this.$('.product-picture').click(function(){
                self.order_product();
                self.pos_widget.screen_selector.set_current_screen(self.next_screen);
            });
        },
        get_product: function(){
            var ss = this.pos_widget.screen_selector;
            if(ss){
                return ss.get_current_screen_param('product');
            }else{
                return undefined;
            }
        },
        order_product: function(){
            this.pos.get('selectedOrder').addProduct(this.get_product(),{ quantity: this.weight });
        },
        get_product_name: function(){
            var product = this.get_product();
            return (product ? product.name : undefined) || 'Unnamed Product';
        },
        get_product_price: function(){
            var product = this.get_product();
            return (product ? product.price : 0) || 0;
        },
        set_weight: function(weight){
            this.weight = weight;
            this.$('.js-weight').text(this.get_product_weight_string());
        },
        get_product_weight_string: function(){
            return (this.weight || 0).toFixed(3) + ' Kg';
        },
        get_product_image_url: function(){
            var product = this.get_product();
            if(product){
                return window.location.origin + '/web/binary/image?model=product.product&field=image_medium&id='+product.id;
            }else{
                return "";
            }
        },
        close: function(){
            var self = this;
            this._super();
            $('body').off('keyup',this.hotkey_handler);

            this.pos.proxy_queue.clear();
            this.pos.proxy_queue.schedule(function(){
                self.pos.proxy.weighting_end();
            },{ important: true });
        },
    });


    module.ClientPaymentScreenWidget =  module.ScreenWidget.extend({
        template:'ClientPaymentScreenWidget',

        next_screen: 'welcome',
        previous_screen: 'products',

        show: function(){
            this._super();
            var self = this;

            this.queue = new module.JobQueue();
            this.canceled = false;
            this.paid     = false;

            // initiates the connection to the payment terminal and starts the update requests
            this.start = function(){
                var def = new $.Deferred();
                self.pos.proxy.payment_request(self.pos.get('selectedOrder').getDueLeft())
                    .done(function(ack){
                        if(ack === 'ok'){
                            self.queue.schedule(self.update);
                        }else if(ack.indexOf('error') === 0){
                            console.error('cannot make payment. TODO');
                        }else{
                            console.error('unknown payment request return value:',ack);
                        }
                        def.resolve();
                    });
                return def;
            };
            
            // gets updated status from the payment terminal and performs the appropriate consequences
            this.update = function(){
                var def = new $.Deferred();
                if(self.canceled){
                    return def.resolve();
                }
                self.pos.proxy.payment_status()
                    .done(function(status){
                        if(status.status === 'paid'){

                            var currentOrder = self.pos.get('selectedOrder');
                            
                            //we get the first cashregister marked as self-checkout
                            var selfCheckoutRegisters = [];
                            for(var i = 0; i < self.pos.cashregisters.length; i++){
                                var cashregister = self.pos.cashregisters[i];
                                if(cashregister.self_checkout_payment_method){
                                    selfCheckoutRegisters.push(cashregister);
                                }
                            }

                            var cashregister = selfCheckoutRegisters[0] || self.pos.cashregisters[0];
                            currentOrder.addPaymentline(cashregister);
                            self.pos.push_order(currentOrder)
                            currentOrder.destroy();
                            self.pos.proxy.transaction_end();
                            self.pos_widget.screen_selector.set_current_screen(self.next_screen);
                            self.paid = true;
                        }else if(status.status.indexOf('error') === 0){
                            console.error('error in payment request. TODO');
                        }else if(status.status === 'waiting'){
                            self.queue.schedule(self.update,200);
                        }else{
                            console.error('unknown status value:',status.status);
                        }
                        def.resolve();
                    });
                return def;
            }
            
            // cancels a payment.
            this.cancel = function(){
                if(!self.paid && !self.canceled){
                    self.canceled = true;
                    self.pos.proxy.payment_cancel();
                    self.pos_widget.screen_selector.set_current_screen(self.previous_screen);
                    self.queue.clear();
                }
                return (new $.Deferred()).resolve();
            }
            
            if(this.pos.get('selectedOrder').getDueLeft() <= 0){
                this.pos_widget.screen_selector.show_popup('error-negative-price');
            }else{
                this.queue.schedule(this.start);
            }

            this.add_action_button({
                    label: _t('Back'),
                    icon: '/point_of_sale/static/src/img/icons/png48/go-previous.png',
                    click: function(){  
                       self.queue.schedule(self.cancel);
                       self.pos_widget.screen_selector.set_current_screen(self.previous_screen);
                    }
                });
        },
        close: function(){
            if(this.queue){
                this.queue.schedule(this.cancel);
            }
            //TODO CANCEL
            this._super();
        },
    });

    module.WelcomeScreenWidget = module.ScreenWidget.extend({
        template:'WelcomeScreenWidget',

        next_screen: 'products',

        show_numpad:     false,
        show_leftpane:   false,
        start: function(){
            this._super();
            $('.goodbye-message').click(function(){
                $(this).addClass('oe_hidden');
            });
        },

        barcode_product_action: function(code){
            this.pos.proxy.transaction_start();
            this._super(code);
        },

        barcode_client_action: function(code){
            this.pos.proxy.transaction_start();
            this._super(code);
            $('.goodbye-message').addClass('oe_hidden');
            this.pos_widget.screen_selector.show_popup('choose-receipt');
        },
        
        show: function(){
            this._super();
            var self = this;

            this.add_action_button({
                    label: _t('Help'),
                    icon: '/point_of_sale/static/src/img/icons/png48/help.png',
                    click: function(){ 
                        $('.goodbye-message').css({opacity:1}).addClass('oe_hidden');
                        self.help_button_action();
                    },
                });

            $('.goodbye-message').css({opacity:1}).removeClass('oe_hidden');
            setTimeout(function(){
                $('.goodbye-message').animate({opacity:0},500,'swing',function(){$('.goodbye-message').addClass('oe_hidden');});
            },5000);
        },
    });
    
    module.ProductScreenWidget = module.ScreenWidget.extend({
        template:'ProductScreenWidget',

        scale_screen: 'scale',
        client_scale_screen : 'scale_invite',
        client_next_screen:  'client_payment',

        show_numpad:     true,
        show_leftpane:   true,

        start: function(){ //FIXME this should work as renderElement... but then the categories aren't properly set. explore why
            var self = this;

            this.product_list_widget = new module.ProductListWidget(this,{
                click_product_action: function(product){
                    if(product.to_weight && self.pos.config.iface_electronic_scale){
                        self.pos_widget.screen_selector.set_current_screen( self.cashier_mode ? self.scale_screen : self.client_scale_screen, {product: product});
                    }else{
                        self.pos.get('selectedOrder').addProduct(product);
                    }
                },
                product_list: this.pos.db.get_product_by_category(0)
            });
            this.product_list_widget.replace($('.placeholder-ProductListWidget'));

            this.product_categories_widget = new module.ProductCategoriesWidget(this,{
                product_list_widget: this.product_list_widget,
            });
            this.product_categories_widget.replace($('.placeholder-ProductCategoriesWidget'));
        },

        show: function(){
            this._super();
            var self = this;

            this.product_categories_widget.reset_category();

            this.pos_widget.order_widget.set_editable(true);

            if(this.pos_widget.screen_selector.current_mode === 'client'){ 
                this.add_action_button({
                        label: _t('Pay'),
                        icon: '/point_of_sale/static/src/img/icons/png48/go-next.png',
                        click: function(){  
                            self.pos_widget.screen_selector.set_current_screen(self.client_next_screen);
                        }
                    });
            }
        },

        close: function(){
            this._super();

            this.pos_widget.order_widget.set_editable(false);

            if(this.pos.config.iface_vkeyboard && this.pos_widget.onscreen_keyboard){
                this.pos_widget.onscreen_keyboard.hide();
            }
        },
    });

    module.ReceiptScreenWidget = module.ScreenWidget.extend({
        template: 'ReceiptScreenWidget',

        show_numpad:     true,
        show_leftpane:   true,

        show: function(){
            this._super();
            var self = this;

            var print_button = this.add_action_button({
                    label: _t('Print'),
                    icon: '/point_of_sale/static/src/img/icons/png48/printer.png',
                    click: function(){ self.print(); },
                });

            var finish_button = this.add_action_button({
                    label: _t('Next Order'),
                    icon: '/point_of_sale/static/src/img/icons/png48/go-next.png',
                    click: function() { self.finishOrder(); },
                });

            this.refresh();
            this.print();

            //
            // The problem is that in chrome the print() is asynchronous and doesn't
            // execute until all rpc are finished. So it conflicts with the rpc used
            // to send the orders to the backend, and the user is able to go to the next 
            // screen before the printing dialog is opened. The problem is that what's 
            // printed is whatever is in the page when the dialog is opened and not when it's called,
            // and so you end up printing the product list instead of the receipt... 
            //
            // Fixing this would need a re-architecturing
            // of the code to postpone sending of orders after printing.
            //
            // But since the print dialog also blocks the other asynchronous calls, the
            // button enabling in the setTimeout() is blocked until the printing dialog is 
            // closed. But the timeout has to be big enough or else it doesn't work
            // 2 seconds is the same as the default timeout for sending orders and so the dialog
            // should have appeared before the timeout... so yeah that's not ultra reliable. 

            finish_button.set_disabled(true);   
            setTimeout(function(){
                finish_button.set_disabled(false);
            }, 2000);
        },
       
        print: function() {
            window.print();
        },
        finishOrder: function() {
            
            this.pos.get('selectedOrder').destroy();
            
        },
        refresh: function() {
            var order = this.pos.get('selectedOrder');
            $('.pos-receipt-container', this.$el).html(QWeb.render('PosTicket',{
                    widget:this,
                    order: order,
                    orderlines: order.get('orderLines').models,
                    paymentlines: order.get('paymentLines').models,
                }));
        },
        close: function(){
            this._super();
        }
    });

    module.PaymentScreenWidget = module.ScreenWidget.extend({
        template: 'PaymentScreenWidget',
        back_screen: 'products',
        next_screen: 'receipt',
        init: function(parent, options) {
            var self = this;
            this._super(parent,options);
            this.pos.bind('change:selectedOrder',function(){
                    this.bind_events();
                    this.renderElement();
                },this);

            this.bind_events();           
            this.line_delete_handler = function(event){
                var node = this;
                while(node && !node.classList.contains('paymentline')){
                    node = node.parentNode;
                }
                if(node){
                    self.pos.get('selectedOrder').removePaymentline(node.line)   
                }
                event.stopPropagation();
            };

            this.line_change_handler = function(event){
                var node = this;
                while(node && !node.classList.contains('paymentline')){
                    node = node.parentNode;
                }
                if(node){
                    node.line.set_amount(this.value);
                }
                
            };

            this.line_click_handler = function(event){
                var node = this;
                while(node && !node.classList.contains('paymentline')){
                    node = node.parentNode;
                }
                if(node){
                    self.pos.get('selectedOrder').selectPaymentline(node.line);
                }
            };

            this.hotkey_handler = function(event){
                if(event.which === 13){
                    var action_bar = self.pos_widget.action_bar;
                    if (undefined != action_bar.buttons['validation_member'] && false == action_bar.buttons['validation_member'].disabled) {
                        action_bar.buttons['validation_member'].$el.click();
                    }else if(undefined != action_bar.buttons['validate_pay'] && false == action_bar.buttons['validate_pay'].disabled) {
                        action_bar.buttons['validate_pay'].$el.click();
                    }
                }else if(event.which === 27){
                    self.back();
                }
            };

        },

        //清空支付行  
        remove_paymentlines: function(){
            var order = this.pos.get('selectedOrder');
            var lines = order.get('paymentLines').models.slice(0);
            for(var i = 0; i < lines.length; i++){ 
                var line = lines[i];
                order.removePaymentline(line);
            } 
        },


        init_paymentlines: function(){
            var currentOrder = this.pos.get('selectedOrder');
            var paymentlines = currentOrder.get('paymentLines').models;
            var new_payment_list = [];
            var last_payment_list = null;

            var first = true;
            for (var i = 0; i < paymentlines.length; i++) {
                paymentlines[i].set_amount(0);
                if(paymentlines[i].get_code().toLowerCase() == 'tcsh'){
                    last_payment_list = paymentlines[i];
                    continue;
                }

                if(first){
                    paymentlines[i].set_amount(currentOrder.get_all_discMoney());   
                    first = false;
                }
                new_payment_list.push(paymentlines[i]);
            };
            if(null != last_payment_list){
                new_payment_list.push(last_payment_list);
            }
            for (var i = 0; i < new_payment_list.length; i++) {
                currentOrder.addPaymentline(new_payment_list[i].cashregister);
            };

        },

        show: function(){
            this._super();
            var self = this;
            
            this.enable_numpad();
            this.focus_selected_line();
            
            document.body.addEventListener('keyup', this.hotkey_handler);
             

            this.init_paymentlines();
            if(self.pos.get('selectedOrder').get_member()){
                this.update_payment_summary();
                this.add_action_button({
                    label: _t('Back'),
                    icon: '/point_of_sale/static/src/img/icons/png48/go-previous.png',
                    click: function(){
                        self.pos_widget.screen_selector.set_current_screen('verifymemberid');    
                    },
                });

                this.add_action_button({
                    label: _t('Validate'),
                    name: 'validate_pay',
                    icon: '/point_of_sale/static/src/img/icons/png48/validate.png',
                    click: function(){
                        self.validate_order(); 
                    },
                });               

            }else{
                 this.add_action_button({
                    label: _t('Back'),
                    icon: '/point_of_sale/static/src/img/icons/png48/go-previous.png',
                    click: function(){  
                        self.back();
                    },
                });

                this.add_action_button({
                    label: _t('Validate'),
                    name: 'validation',
                    icon: '/point_of_sale/static/src/img/icons/png48/validate.png',
                    click: function(){
                        self.validate_order(); 
                    },
                });
            
                this.add_action_button({
                    label: _t('会员验证'),
                    name: 'validation_member',
                    icon: '/point_of_sale/static/src/img/icons/png48/validate.png',
                    click: function(){
                        self.pos_widget.screen_selector.set_current_screen('verifymemberid');                   
                    },
                });
            
                if( this.pos.config.iface_invoicing ){
                    this.add_action_button({
                            label: 'Invoice',
                            name: 'invoice',
                            icon: '/point_of_sale/static/src/img/icons/png48/invoice.png',
                            click: function(){
                                self.validate_order({invoice: true});
                            },
                        });
                }

                if( this.pos.config.iface_cashdrawer ){
                    this.add_action_button({
                            label: _t('Cash'),
                            name: 'cashbox',
                            icon: '/point_of_sale/static/src/img/open-cashbox.png',
                            click: function(){
                                self.pos.proxy.open_cashbox();
                            },
                        });
                }           
            }


            this.update_payment_summary();

        },
        close: function(){
            this._super();
            this.disable_numpad();
            document.body.removeEventListener('keyup',this.hotkey_handler);
        },

        remove_empty_lines: function(){
            var order = this.pos.get('selectedOrder');
            var lines = order.get('paymentLines').models.slice(0);
            for(var i = 0; i < lines.length; i++){ 
                var line = lines[i];
                if(line.get_amount() === 0){
                    order.removePaymentline(line);
                }
            }
        },

        back: function() {
            this.pos.get('selectedOrder').remove_member();
            //this.pos.get('selectedOrder').remove_all_discount();                     
            this.remove_empty_lines();
            this.pos_widget.screen_selector.set_current_screen(this.back_screen);
        },

        bind_events: function() {
            if(this.old_order){
                this.old_order.unbind(null,null,this);
            }
            var order = this.pos.get('selectedOrder');
                order.bind('change:selected_paymentline',this.focus_selected_line,this);

            this.old_order = order;

            if(this.old_paymentlines){
                this.old_paymentlines.unbind(null,null,this);
            }
            var paymentlines = order.get('paymentLines');
                paymentlines.bind('add', this.add_paymentline, this);
                paymentlines.bind('change:selected', this.rerender_paymentline, this);
                paymentlines.bind('change:amount', function(line){
                        if(!line.selected && line.node){
                            line.node.value = line.amount.toFixed(2);
                        }
                        this.update_payment_summary();
                    },this);
                paymentlines.bind('remove', this.remove_paymentline, this);
                paymentlines.bind('all', this.update_payment_summary, this);

            this.old_paymentlines = paymentlines;

            if(this.old_orderlines){
                this.old_orderlines.unbind(null,null,this);
            }
            var orderlines = order.get('orderLines');
                orderlines.bind('all', this.update_payment_summary, this);

            this.old_orderlines = orderlines;
        },
        focus_selected_line: function(){
            var line = this.pos.get('selectedOrder').selected_paymentline;
            if(line){
                var input = line.node.querySelector('input');
                if(!input){
                    return;
                }
                var value = input.value;
                input.focus();

                if(this.numpad_state){
                    this.numpad_state.reset();
                }

                if(Number(value) === 0){
                    input.value = '';
                }else{
                    input.value = value;
                    input.select();
                }
            }
        },
        add_paymentline: function(line) {
            var list_container = this.el.querySelector('.payment-lines');
                list_container.appendChild(this.render_paymentline(line));
            
            if(this.numpad_state){
                this.numpad_state.reset();
            }
        },
        render_paymentline: function(line){
            var el_html  = openerp.qweb.render('Paymentline',{widget: this, line: line});
                el_html  = _.str.trim(el_html);

            var el_node  = document.createElement('tbody');
                el_node.innerHTML = el_html;
                el_node = el_node.childNodes[0];
                el_node.line = line;
                el_node.querySelector('.paymentline-delete')
                    .addEventListener('click', this.line_delete_handler);
                el_node.addEventListener('click', this.line_click_handler);
                el_node.querySelector('input')
                    .addEventListener('keyup', this.line_change_handler);

            line.node = el_node;

            return el_node;
        },
        rerender_paymentline: function(line){
            var old_node = line.node;
            var new_node = this.render_paymentline(line);
            
            old_node.parentNode.replaceChild(new_node,old_node);
        },
        remove_paymentline: function(line){
            line.node.parentNode.removeChild(line.node);
            line.node = undefined;
        },
        renderElement: function(){
            this._super();

            var paymentlines   = this.pos.get('selectedOrder').get('paymentLines').models;
            var list_container = this.el.querySelector('.payment-lines');

            for(var i = 0; i < paymentlines.length; i++){
                list_container.appendChild(this.render_paymentline(paymentlines[i]));
            }
            
            this.update_payment_summary();
        },
        update_payment_summary: function() {
            var currentOrder = this.pos.get('selectedOrder');
           
            var paidTotal = currentOrder.getPaidTotal();
            var dueTotal = currentOrder.getTotalTaxIncluded();
           
            var remaining = dueTotal > paidTotal ? dueTotal - paidTotal : 0;
            var change = paidTotal > dueTotal ? paidTotal - dueTotal : 0;
            var self = this;


            if(currentOrder.get_member()){   
                this.$('.payment-due-discount').show();
                this.$('.payment-due-discount').html(currentOrder.get('member').discount*100+_t("折"));
                var back_point = currentOrder.get_add_point();
                var new_total_point = back_point + currentOrder.get('member').points;
                currentOrder.set_total_point(new_total_point);
            }else{

                this.$('.payment-due-discount').hide();
            }
            self.$('.payment-due-total').html(self.format_currency(dueTotal));
            self.$('.payment-paid-total').html(self.format_currency(paidTotal));
            self.$('.payment-remaining').html(self.format_currency(remaining));
            self.$('.payment-change').html(self.format_currency(change));
            if(currentOrder.selected_orderline === undefined){
                remaining = 1;  // What is this ? 
            }


            if(self.pos_widget.action_bar){
                self.pos_widget.action_bar.set_button_disabled('validation', !self.is_paid());
                self.pos_widget.action_bar.set_button_disabled('invoice', !self.is_paid());
                self.pos_widget.action_bar.set_button_disabled('validate_pay', !self.is_paid());
            }

            //如果包含会员卡支付，禁掉validate按钮
            self.pos.get('selectedOrder').get('paymentLines').each(function(payline){
                if(payline.get_code().toLowerCase() == 'tvip'){
                    self.pos_widget.action_bar.set_button_disabled('validation', true);
                    self.pos_widget.action_bar.set_button_disabled('invoice', true);
                };
            });

        },
        is_paid: function(){
            var currentOrder = this.pos.get('selectedOrder');
            return (currentOrder.getTotalTaxIncluded() < 0.000001 
                   || currentOrder.getPaidTotal() + 0.000001 >= currentOrder.getTotalTaxIncluded());

        },
        validate_order: function(options) {
            var self = this;
            options = options || {};

            var currentOrder = self.pos.get('selectedOrder');

            if(!self.is_paid()){
                return;
            }            

            if(options.invoice){
                // deactivate the validation button while we try to send the order
                self.pos_widget.action_bar.set_button_disabled('validation',true);
                self.pos_widget.action_bar.set_button_disabled('invoice',true);

                var invoiced = self.pos.push_and_invoice_order(currentOrder);

                invoiced.fail(function(error){
                    if(error === 'error-no-client'){
                        self.pos_widget.screen_selector.show_popup('error-no-client');
                    }else{
                        self.pos_widget.screen_selector.show_popup('error-invoice-transfer');
                    }
                    self.pos_widget.action_bar.set_button_disabled('validation',false);
                    self.pos_widget.action_bar.set_button_disabled('invoice',false);
                });

                invoiced.done(function(){
                    self.pos_widget.action_bar.set_button_disabled('validation',false);
                    self.pos_widget.action_bar.set_button_disabled('invoice',false);
                    self.pos.get('selectedOrder').destroy();
                });

            }else{

                this.update_payment_summary();

                this.validate_push_order(); 
            }

            // hide onscreen (iOS) keyboard 
            setTimeout(function(){
                document.activeElement.blur();
                $("input").blur();
            },250);

        },

        
        enable_numpad: function(){
            this.disable_numpad();  //ensure we don't register the callbacks twice
            this.numpad_state = this.pos_widget.numpad.state;
            if(this.numpad_state){
                this.numpad_state.reset();
                this.numpad_state.changeMode('payment');
                this.numpad_state.bind('set_value',   this.set_value, this);
                this.numpad_state.bind('change:mode', this.set_mode_back_to_payment, this);
            }
                    
        },

        disable_numpad: function(){
            if(this.numpad_state){
                this.numpad_state.unbind('set_value',  this.set_value);
                this.numpad_state.unbind('change:mode',this.set_mode_back_to_payment);
            }
        },

    	set_mode_back_to_payment: function() {
    		this.numpad_state.set({mode: 'payment'});
    	},

        set_value: function(val) {
            var currentOrder = this.pos.get("selectedOrder");            
            var selected_line =this.pos.get('selectedOrder').selected_paymentline;
            if(selected_line){
                selected_line.set_amount(val*discount);
                selected_line.node.querySelector('input').value = selected_line.amount.toFixed(2);
            }
        },
    });
    
    //begin 20140715  vip membership
    module.ValidateMemberScreenWidget  = module.ScreenWidget.extend({
        template: 'ValidateMemberScreenWidget',
        send_verify_seconds: 60, //默认短信验证码发送时间
        enter_verify_seconds: 300, //默认短信验证码填写时间
        _set_conter: null,

        show: function(){
        	this._super();
        	var self = this;         	

            
            this.init_hidden_payment_div(self);
            this.build_widgets(self);
            this.init_change_element();
            // 默认选择短信验证方式
            self.$el.find('input.sms-radio').attr("checked",true);
            self.$el.find('.sms').focus();           
        },


        init_hidden_payment_div: function(self){
            //初始化需要隐藏的层
            var paymentlines = this.pos.get('selectedOrder').get('paymentLines').models;
            var flag = true;

            self.$el.find('.member-error-msg').addClass('oe_hidden');    
            self.$el.find('.validate-type').addClass('oe_hidden');
            self.$el.find('.validate-passwd').addClass('oe_hidden');
            self.$el.find(".validate-message").addClass('oe_hidden');            

            for (var i = 0; i < paymentlines.length; i++) {
                if('tvip' == paymentlines[i].cashregister.journal.code.toLowerCase()){
                    self.$el.find('.validate-type').removeClass('oe_hidden');                
                    self.$el.find(".validate-message").removeClass('oe_hidden');
                    self.$el.find(".validate-block").css('height','90px');
                    break;
                }
            };
        },
        
       // 渲染订单界面
        render_order:function(member){
            var currentOrder = this.pos.get('selectedOrder');
           
            if(member){
                discount = member.discount;
                this.$el.find(".member-id").val(member.member_id);
                this.$el.find(".m-level").html(member.m_level);
                this.$el.find(".m-discount").html(discount*100+" 折");
                this.$el.find(".m-total").html(member.total_money);
                this.$el.find(".m-points").html(member.points);

                if(this.$el.find(".member-id").hasClass('readonly')){
                    this.$el.find(".member-card").addClass('oe_hidden');
                    this.$el.find(".member-id").attr('readonly', 'readonly');
                }
                this.$el.find('.sms').focus();

            }else{
                discount = 1;
                this.$el.find(".m-level").html('');
                this.$el.find(".m-discount").html('');
                this.$el.find(".m-total").html('');
                this.$el.find(".m-points").html('');
                this.$el.find(".member-card").removeClass('oe_hidden');    
            }
            
            this.$el.find(".pay-money").html(this.format_currency(currentOrder.get_paymentline_amount('tvip')));
            this.$el.find(".pay-points").html("积分：" + currentOrder.get_add_point());

            if(currentOrder.get('member')){
                this.$el.find(".disc-money").html(currentOrder.get_all_privilege_price().toFixed(2));
            }else{
                this.$el.find(".disc-money").html("0");
            }
           
            this.$el.find(".order-no").html(currentOrder.get('name').split(' ')[1]);
        },
        

        // 发送短信验证码
        read_code: function(self, member_id){
            self.$el.find('.get-code-btn').attr("disabled", true);   //为了防止重复点击造成发送多次短信
            var currentOrder = self.pos.get('selectedOrder');

            if(currentOrder.validate_dead_time_sms(self.send_verify_seconds)){
                self.$el.find(".member-error-msg").html('60秒内只允许发送一条短信!').removeClass('oe_hidden')
                return;
            }

            self.rpc('/vip_membership/get_validate_code',{args:{member_id: member_id}}).then(function(trans){
                if (trans.flag) {
                    currentOrder.set_send_verify_time();
                    currentOrder.set_curr_verify(trans.SecCode);
                    self.set_counter(self);
                    self.$el.find(".member-error-msg").html('请在5分钟内输入验证码!').removeClass('oe_hidden');
                }else{
                    self.$el.find(".member-error-msg").html(trans.info).removeClass('oe_hidden'); 
                    self.$el.find('.get-code-btn').attr("disabled", false);
                };
            });
        },

        //设置短信发送按钮失效期计时器
        set_counter: function(self){
            var seconds = self.send_verify_seconds;
            self._set_conter = setInterval(function() {
                seconds--;
                self.$el.find('.get-code-btn').attr("disabled", true)
                    .text('已发送验证码(' + seconds + ')');
                if(seconds <= 0){
                    self.$el.find('.get-code-btn').attr("disabled", false)
                    .text('发送短信验证码');
                    clearInterval(self._set_conter);
                }
            }, 1000);
        },

        init_change_element: function(){
            clearInterval(this._set_conter);
            this.$el.find('.get-code-btn').attr("disabled", false).text('发送短信验证码');
            this.$el.find('.pay-status').text('正在等待会员支付');
        },

        
        validate_order:function(self){
            var currentOrder = self.pos.get('selectedOrder');

            if (currentOrder.get_payment('tvip').get_paid()){
                self.validate_push_order();
                return; 
            }

            var member_id = self.$el.find(".member-id").val().trim();
            var pwd = "";
            var name = this.pos.config.id;
            var last_money = currentOrder.get_paymentline_amount('tvip');
        	var checked_verify_type = self.$el.find('input[name=verify-type]:checked');
            var points = currentOrder.get_point_by_code('tvip');

            if(checked_verify_type.hasClass('sms-radio')) {
                var pwd = currentOrder.get_curr_verify()
                var curr_pwd = $('.sms').val();
                if(undefined == pwd){
                    self.$el.find(".member-error-msg").removeClass('oe_hidden').text("请先获取验证码"); 
                    return;
                }

                if(curr_pwd != pwd){
                    self.$el.find(".member-error-msg").removeClass('oe_hidden').text("验证码错误"); 
                    return;
                }

                if(currentOrder.validate_dead_time_sms(self.enter_verify_seconds)) {
                    self.$el.find(".member-error-msg").removeClass('oe_hidden').text("您的验证码已超时，请重新获取验证码");
                    return; 
                }
                type = 1
            }else if(checked_verify_type.hasClass('passwd-radio')) {
                pwd = self.$el.find(".password").val();
                if ("" == pwd || "" == member_id) {
                    self.$el.find(".member-error-msg").removeClass('oe_hidden').text("请输入会员卡号与支付密码"); 
                    return;
                };

                type = 2
            }
            self.validate_pay(self, member_id, pwd, last_money, name, points, type);
        },

        //验证支付
        validate_pay: function(self, member_id, pwd, last_money, name, points, type) {
            self.disabled_validate_btn();

            self.rpc('/vip_membership/member_sale_money_points',{'args':{'member_id': member_id,
                                                                    'pwd': pwd, 
                                                                    "last_money": last_money, 
                                                                    'name': name, 
                                                                    'type': type, 
                                                                    'points': points}})
            .then(function(trans){
                self.enable_validate_btn();

                if(trans.flag){
                    var currentOrder = self.pos.get('selectedOrder');  
                    currentOrder.set_payment_paid('tvip', true);
                    self.$el.find('.pay-status').text('支付成功');
                    
                    self.validate_push_order();
                    // setTimeout(function (){self.validate_push_order()}, 8000);
                    
                }else if(!trans.flag){
                    self.$el.find(".member-error-msg").removeClass('oe_hidden').html(trans.info);   
                }
            });
        },

        enable_validate_btn: function(){
            $('.validate_btn').attr('disabled', false);
            this.pos_widget.action_bar.set_button_disabled('ValidateMember', false);
            this.pos_widget.action_bar.set_button_disabled('back', false);
        },

        disabled_validate_btn: function(){
            $('.validate_btn').attr('disabled', true);
            this.pos_widget.action_bar.set_button_disabled('ValidateMember', true);
        },
        
        build_widgets: function(self){
            var currentOrder = self.pos.get('selectedOrder');  

            var back_button = self.add_action_button({
                label: _t('Back'),
                icon: '/point_of_sale/static/src/img/icons/png48/go-previous.png',
                click: function(){
                    self.back();
                },
            });
            
            self.add_action_button({
                label: _t('ValidateMem'),
                name: 'ValidateMember',
                icon: '/point_of_sale/static/src/img/icons/png48/validate.png',
                click: function(){
                    
                    self.validate_order(self);

                },
            });

            //会员密码是否为空
            // console.log(currentOrder.get_member());
            if(currentOrder.get_member().has_pwd == true){
                self.$el.find(".passwd-radio").attr('disabled',false);
            }else{
                self.$el.find(".passwd-radio").attr('disabled',true);
            }

            //验证码与短信码切换
            self.bind_event(self.$el.find('input[name=verify-type]'), 'click', function(){
                if($(this).hasClass('sms-radio')){
                    self.$el.find('.validate-passwd').addClass('oe_hidden');
                    self.$el.find('.validate-message').removeClass('oe_hidden');
                    self.$el.find('.sms').val('');
                    self.$el.find('.sms').focus();
                }else if($(this).hasClass('passwd-radio')){
                    self.$el.find('.validate-message').addClass('oe_hidden');
                    self.$el.find('.validate-passwd').removeClass('oe_hidden');
                    self.$el.find('.password').val('');
                    self.$el.find('.password').focus();
                }
            });
            
            //密码与短信验证
            $('.validate_btn').unbind('click');  //因为javascript与jquery中都不会有

            self.bind_event(self.$el.find('button.validate_btn'), 'click', function(){
                self.validate_order(self);
            });

            //短信读取
            self.bind_event(self.$el.find(".get-code-btn"), 'click', function(){
                if(!currentOrder.get('member')){
                    self.$el.find(".member-error-msg").removeClass('oe_hidden').text("请先读取会员信息"); 
                    return;
                }
                self.read_code(self, currentOrder.get('member').member_id);
            });
        
            //读取会员信息
            if (currentOrder.get('member')){
                this.$el.find(".member-id").addClass('readonly');
		
                self.render_order(currentOrder.get_member());
            }else{

                self.bind_event(self.$el.find(".read-btn"), 'click', function(){
                    member_id = self.$el.find(".member-id").val().trim();
                    if(member_id !=''){
                        self.rpc('/vip_membership/get_member_info',{args:{member_id:member_id}}).then(function(trans) {
                            if(trans.flag){
                                self.$el.find(".member-error-msg").addClass('oe_hidden'); 

                                 //保存会员信息
                                currentOrder.set_member(trans);                            
                                // currentOrder.set_all_discount(trans.discount);
                                self.render_order(currentOrder.get_member());
                                button_status = false;
                            }else if(!trans.flag){                  
                                self.$el.find(".member-error-msg").html(trans.info);                    
                                self.$el.find(".member-info").addClass('oe_hidden');                   
                               
                                currentOrder.remove_member();
                                // currentOrder.set_all_discount(1);
                                button_status = true;
                            } 

                            self.pos_widget.action_bar.set_button_disabled('Verify', button_status);
                                        
                        });
                    }
                });
            }            
        },

        enable_numpad: function(){
            this.disable_numpad();  //ensure we don't register the callbacks twice
            this.numpad_state = this.pos_widget.numpad.state;
            if(this.numpad_state){
                this.numpad_state.reset();
                this.numpad_state.changeMode('member');
                this.numpad_state.bind('set_value',   this.set_value, this);
                this.numpad_state.bind('change:mode', this.set_mode_back_to_payment, this);
            }
        },
        disable_numpad: function(){
            if(this.numpad_state){
                this.numpad_state.unbind('set_value',  this.set_value);
                this.numpad_state.unbind('change:mode',this.set_mode_back_to_payment);
            }
        },
        set_mode_back_to_payment: function() {
    		this.numpad_state.set({mode: 'member'});
    	},
        back:function(){
        	this.pos_widget.screen_selector.set_current_screen('payment');
        },
    });


    
//验证会员
 module.VerifyMemberIdScreenWidget  = module.ScreenWidget.extend({
        template: 'VerifyMemberIdScreenWidget',

        show:function(){
            this._super();
            var self = this;

            self.build_widgets(self);
            self.read_member(self);
            self.init_member_id(self);
            self.init_hidden_payment_div(self);
            this.set_button_status(self);
            this.render_order();

        },

         build_widgets: function(self){

            var paymentLines = this.pos.get('selectedOrder').get('paymentLines');
            
            this.add_action_button({
                label: _t('Back'),
                icon: '/point_of_sale/static/src/img/icons/png48/go-previous.png',
                click: function(){
                    self.back()
                },
            });

             this.add_action_button({
                label: _t('支付'),
                name: 'Verify',
                icon: '/point_of_sale/static/src/img/icons/png48/validate.png',
                click: function(){
                    self.pos_widget.screen_selector.set_current_screen('payment');                    
                },
            });
         },

         init_hidden_payment_div: function(self){
            //初始化需要隐藏的层
            self.$el.find('.verify-member-error-msg').addClass('oe_hidden');             
            self.$el.find(".verify-member-info").removeClass('oe_hidden');
            
        },

         //初始化会员卡号输入
         init_member_id: function(self){
            var currentOrder = self.pos.get('selectedOrder');  

            self.$el.find(".verify-member-id").focus();
            if(currentOrder.get('member')){
                self.$el.find(".verify-member-id").val(currentOrder.get('member').member_id);
            }else{
                self.$el.find(".verify-member-id").val('');
            }
                
            //设置自动获取卡号事件
            self.$el.find('.verify-member-id').keypress(function (event){   
                var keycode = event.keyCode;
                if(13 == keycode){
                    self.$el.find('.verify-read-btn').click();     
                }
            }).click(function (){
                self.pos_widget.numpad.state = new module.NumpadState();
                document.body.removeEventListener('keyup',self.pos_widget.payment_screen.hotkey_handler);
                self.enable_numpad();
            });
        },

         // 读取会员信息
        read_member: function(self){           
            var currentOrder = self.pos.get('selectedOrder');            
            var button_status = false;
            self.bind_event(self.$el.find(".verify-read-btn"), 'click', function(){

                member_id = self.$el.find(".verify-member-id").val().trim();
                if(member_id !=''){
                    self.rpc('/vip_membership/get_member_info',{args:{member_id:member_id}}).then(function(trans) {
                        if(trans.flag){
                            self.$el.find(".verify-member-info").removeClass('oe_hidden');
                            self.$el.find(".verify-member-error-msg").addClass('oe_hidden'); 
                             //保存会员信息
                             // console.log(trans);
                            currentOrder.set_member(trans);
                            //currentOrder.setMemberId(member_id);
                            // currentOrder.set_all_discount(trans.discount); 
                            button_status = false;

                            setTimeout(function(){
                                if (undefined != self.pos_widget.action_bar.buttons['Verify']){
                                    self.pos_widget.action_bar.buttons['Verify'].$el.click();
                                }                                
                            },3000);                

                        }else if(!trans.flag){                  
                            self.$el.find(".verify-member-error-msg").html(trans.info);                    
                            self.$el.find(".verify-member-info").addClass('oe_hidden');                   
                            self.$el.find(".verify-member-error-msg").removeClass('oe_hidden');
                            currentOrder.remove_member();
                            // currentOrder.set_all_discount(1);
                            button_status = true;
                        } 

                        self.pos_widget.action_bar.set_button_disabled('Verify',button_status);
                        self.render_order();               
                    }).fail(function(){
                        self.$el.find(".verify-member-info").addClass('oe_hidden'); 
                        self.$el.find(".verify-member-error-msg").removeClass('oe_hidden');
                        self.$el.find(".verify-member-error-msg").html(_t("读取会员失败，可能网络无连接或者其他原因！"));
                    });
                }
            });
        },

         // 渲染订单界面
        render_order:function(){
            var currentOrder = this.pos.get('selectedOrder');
            member = currentOrder.get_member();

            if(member){
                discount = member.discount;

                this.$el.find(".verify-m-level").html(member.m_level);
                this.$el.find(".verify-m-discount").html(discount*100+" 折");
                this.$el.find(".verify-m-total").html(member.total_money);
                this.$el.find(".verify-m-points").html(member.points);
            }else{
                discount = 1;
                this.$el.find(".verify-m-level").html('');
                this.$el.find(".verify-m-discount").html('');
                this.$el.find(".verify-m-total").html('');
                this.$el.find(".verify-m-points").html('');
            }            

            this.$el.find(".verify-pay-money").html(this.format_currency(currentOrder.getTotalTaxIncluded()));
            this.$el.find(".verify-pay-points").html("积分："+currentOrder.get_add_point());

            if(currentOrder.get('member')){
                this.$el.find(".verify-disc-money").html(currentOrder.get_all_privilege_price().toFixed(2));
            }else{
                this.$el.find(".verify-disc-money").html("0");            
            }                      
        },        

        set_button_status:function(self){
            if(this.pos.get('selectedOrder').get_member()){
                self.pos_widget.action_bar.set_button_disabled('Verify',false);//会员读取成功之后，状态为可点击
            }else{
                self.pos_widget.action_bar.set_button_disabled('Verify',true);

            }
        },
        enable_numpad: function(){
            this.disable_numpad();  //ensure we don't register the callbacks twice
            this.numpad_state = this.pos_widget.numpad.state;
            if(this.numpad_state){
                this.numpad_state.reset();
                this.numpad_state.changeMode('member');
                this.numpad_state.bind('set_value',   this.set_value, this);
                this.numpad_state.bind('change:mode', this.set_mode_back_to_payment, this);
            }
        },
        disable_numpad: function(){
            if(this.numpad_state){
                this.numpad_state.unbind('set_value',  this.set_value);
                this.numpad_state.unbind('change:mode',this.set_mode_back_to_payment);
            }
        },
        back:function(){
            this.pos.get('selectedOrder').remove_member();
            // this.pos.get('selectedOrder').remove_all_discount();
            this.pos_widget.screen_selector.set_current_screen('payment');
        },
    });
    

    // 微信支付
    module.weixinNativePayScreenWidget = module.ScreenWidget.extend({
         template: 'weixinNativePayScreenWidget',
         back_screen: 'payment',
         next_screen: 'receipt',
         init: function(parent, options) {
             this._super(parent,options);
             this.model = options.model;
             
            
             //微信支付 全局变量 uuid timeout
             var uuid;
             var timeout =null;  
             
         },
         show: function(){
             this._super();
             var self = this;         
    
             if(this.pos.iface_cashdrawer){
                 this.pos.proxy.open_cashbox();
             }
                 
             var back_button = this.add_action_button({
                     label: _t('Back'),
                     icon: '/point_of_sale/static/src/img/icons/png48/go-previous.png',
                     click: function(){  
                         self.back();            
                     },
                 });
             var validate_button = this.add_action_button({
                     label: _t('Validate'),
                     name: 'validation',
                     icon: '/point_of_sale/static/src/img/icons/png48/validate.png',
                     click: function(){
                        self.stop_update();// 停止查询             
                        self.validate_push_order(); 
                     },
                 });

             var currentOrder = this.pos.get('selectedOrder');
             var weixinamount = currentOrder.get_paymentline_amount('twwx');
             
             var fee = Math.round(100*weixinamount);     
             var uid = this.pos.company.company_registry;  
             uuid = this.makeUUID(); 
            
             var purl='fee=' + fee + '&uid=' + uid + '&uuid=' + uuid ;
            
             //显示二维码
             var qr_image = '<img width=300 height=300 src= "http://wx.smallpos.cn/qr.php?'+purl + '" />';
             $(".qrImage").html(qr_image);  
                          
             if(fee >=1 && fee <100000000)  //  支付总额大于等于0.01元且小于1000000元
             {
                 this.pos_widget.action_bar.set_button_disabled('validation',true);//未支付成功时，验证按钮不可用
                 
                 //设定每2秒调用一次请求 
                 timeout = window.setInterval(this.get_weixin_paystate,2000,self,purl);  //getJSON方式  

                 $(".payState").css('background-color','#445F85');
                 $(".payState").html("正在等待微信二维码支付结果······");
                 $(".payAmount").html(fee/100);      
                 $(".order_info").html("小猫云POS       订单号："+currentOrder.get('name').split(' ')[1]);
             }
             else
             {
                 alert("支付金额过大！")
             }            
         },
         close: function(){
             this._super();
            //this.pos_widget.order_widget.set_numpad_state(null);
            //this.pos_widget.payment_screen.set_numpad_state(null);
         },
         
         back: function() {
             this.remove_empty_lines();
             this.stop_update();
             this.pos_widget.screen_selector.set_current_screen(this.back_screen);
             
         },
         
         validateCurrentOrder: function(self){ 
            
            
             self.stop_update();// 停止查询
             
             self.validate_push_order(); 
         },
         
         //删除支付金额为0的支付方式
         remove_empty_lines: function(){
             var order = this.pos.get('selectedOrder');
             var lines = order.get('paymentLines').models.slice(0);
             for(var i = 0; i < lines.length; i++){ 
                 var line = lines[i];
                 if(line.get_amount() === 0){
                     order.removePaymentline(line);
                 }
             }
         },
       
         //清空支付行  
         remove_paymentlines: function(){
             var order = this.pos.get('selectedOrder');
             var lines = order.get('paymentLines').models.slice(0);
             for(var i = 0; i < lines.length; i++){ 
                 var line = lines[i];
                 order.removePaymentline(line);
             } 
         },
         
         //清空购物车
         remove_orderlines:function(){ 
             currentOrder= this.pos.get('selectedOrder')
             len= currentOrder.get('orderLines').models.length;
   
             for (var i=0;i<len;i++)
             {
                 lastline = currentOrder.getLastOrderline();
                 currentOrder.removeOrderline(lastline);
             }
         },
         
         /* ***********************************
          * 通过getJSON查询支付是否成功
          * 返回结果，success or fail
          */
        get_weixin_paystate:function(self,purl){
            var temp = $(".oe_loading").attr("style");
            $(".oe_loading").css({'position':'absolute','z-index':'-2'}); //设置“加载中”在最下层不显示
            var url = "http://wx.smallpos.cn/posgetPayNotice.php?"+purl+"&callback=?";

             $.getJSON(url,function(result){
                if (result == "success"){
                    $(".payState").css('background-color','#4CA698');
                    $(".payState").html("支付成功！   欢迎您再次光临！");
                    $(".sound").attr("src","/point_of_sale/static/src/img/1.wav");
                    
                    self.pos.get('selectedOrder').set_payment_paid('twwx',true);
                    self.stop_update();  // 停止自动查询
                    self.pos_widget.action_bar.set_button_disabled('validation',false);//支付成功后，支付按钮可用

                    //支付成功 8秒后      
                    setTimeout(function(){
                        if (undefined != self.pos_widget.action_bar.buttons['validation']){
                            self.pos_widget.action_bar.buttons['validation'].$el.click();
                        }
                    },8000);

                    $(".oe_loading").attr("style",temp);
                }else{
                    //未支付成功时，验证按钮不可用
                    self.pos_widget.action_bar.set_button_disabled('validation',true);
                    $(".payState").css('background-color','#445F85');
                    $(".payState").html('正在等待微信二维码支付结果······');   
                }
            });  
        },
                
        //停止自动刷新
        stop_update:function(){
            if (timeout != null){
                window.clearInterval(timeout);
            }
        },     
          /* 
           * #1.生成16进制32位myuuid
             #2.分成8组
             #3.将16进制的 str1 转换成10进制整数int_x
             #4.将x%62作为索引，从chars中取字符
           */
        makeUUID:function(){
              var chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'.split('');
              myuuid =this.createUUID();
              short_uuid =[];
              for(var i = 0;i<8;i++)
                  {
                    str1 = myuuid.substr(i*4,i*4+4);
                    int_x = parseInt(str1,16);
                    index = int_x%62;
                    short_uuid[i] = chars[0 | index] ;
                  }
              return short_uuid.join('');
        },
                  
        // INSTANCE SPECIFIC METHODS
        createUUID:function(){
              //
              // Loose interpretation of the specification DCE 1.1: Remote Procedure Call
              // since JavaScript doesn't allow access to internal systems, the last 48 bits
              // of the node section is made up using a series of random numbers (6 octets long).
              //
            var dg = new Date(1582, 10, 15, 0, 0, 0, 0);
            var dc = new Date();
            var t = dc.getTime() - dg.getTime();
            var tl = this.getIntegerBits(t,0,31);
            var tm = this.getIntegerBits(t,32,47);
            var thv = this.getIntegerBits(t,48,59) + '1'; // version 1, security version is 2
            var csar = this.getIntegerBits(this.rand(4095),0,7);
            var csl = this.getIntegerBits(this.rand(4095),0,7);

            // since detection of anything about the machine/browser is far to buggy,
            // include some more random numbers here
            // if NIC or an IP can be obtained reliably, that should be put in
            // here instead.
            var n = this.getIntegerBits(this.rand(8191),0,7) +
                    this.getIntegerBits(this.rand(8191),8,15) +
                    this.getIntegerBits(this.rand(8191),0,7) +
                    this.getIntegerBits(this.rand(8191),8,15) +
                    this.getIntegerBits(this.rand(8191),0,15); // this last number is two octets long
            return tl + tm  + thv  + csar + csl + n;
          },
        //Pull out only certain bits from a very large integer, used to get the time
        //code information for the first part of a UUID. Will return zero's if there
        //aren't enough bits to shift where it needs to.
        getIntegerBits :function(val,start,end){
            var base16 = this.returnBase(val,16);
            var quadArray = new Array();
            var quadString = '';
            var i = 0;
            for(i=0;i<base16.length;i++){
                quadArray.push(base16.substring(i,i+1));   
            }
            for(i=Math.floor(start/4);i<=Math.floor(end/4);i++){
                if(!quadArray[i] || quadArray[i] == '') quadString += '0';
                else quadString += quadArray[i];
            }
            return quadString;
        },
        
        //Replaced from the original function to leverage the built in methods in
        //JavaScript. Thanks to Robert Kieffer for pointing this one out
        returnBase :function(number, base){
        return (number).toString(base).toUpperCase();
        },
        //pick a random number within a range of numbers
        //int b rand(int a); where 0 <= b <= a
        rand :function(max){
            return Math.floor(Math.random() * (max + 1));
        },    
     });
}


