var configuration = function(){

	this.version = "0.4";

	this.maxLength = 2500;
	this.maxPasswordLength = 64;

	this.allowedVersions = [ "0.4", "0.3", "0.2" ,"0.1" ];

	this.desktopMode = "desktopMode";
	this.mobileMode = "mobileMode";
	this.desktopMode_v2024 = "desktopMode_v2024";
	this.allowedModes = [ this.desktopMode, this.mobileMode, this.desktopMode_v2024 ];

	this.currentMode = "";

	this.textModuleKey = 1;
	this.keyExchangeModuleKey = 2;

	this.isPrePackageVersion = function(version){
		if (version == "0.3"
			|| version == "0.2"
			|| version == "0.1")
			return true;
		return false;
	};

    // Mock message to trick default recognition into using text messages instead of voice messages
	this.mockMessage = "v";
	//this.mockMessage = "⁥";

	// DESKTOP MODE SELECTORS
	this.nativeSelectors = {
		form: ".im-page--chat-input",
		chatBox : ".im-chat-input--text",
		chatBoxContainer : ".im-chat-input--textarea",
		attachmentButton : ".media_selector.clear_fix",
		placeholder : ".placeholder",
		smileButton : ".im-chat-input--smile-wrap",
		sendButton : ".im-send-btn.im-chat-input--send",
		windowContainer : ".im-chat-input.clear_fix",
		chatHistoryContainer : ".im-page--chat-body-wrap-inner",
		buttonsContainer : "._im_media_selector.im-chat-input--selector",
		dialogContainer : "._im_peer_history.im-page-chat-contain",
		attachButtonImage : ".ms_item_more_label",

		// Part of the page which is always present in vk.com and should be tracked to know when user has entered PM section.
		vkBodyId : "page_body",

		// Selector for the current user identifier.
		vkAuthor : "#l_pr a:first",

		// Selector for fetching text messages. Text content of these nodes is the actual text of the message.
		//! Edited message or message with attachments may have additional tag which might cause incorrect text content.
		//! It is expected for edited messages since VKEncrypt protocol will not support editing of the messages.
		//! Media content encryption has the lowest priority.
		messageTextNode : "div.im-mess--text.wall_module._im_log_body",

		// Selector for finding parent of the message for determining identifier of the message's author.
		messageGroupParent : "div.im-mess-stack--content",

		messageAuthorLinkSelector : ".im-mess-stack--lnk",

		// Selector to get message identifier from the parent.
		messageIdParent : "li.im-mess",

		vkIterateMessagesSelector : "div.im-mess--text.wall_module._im_log_body",

		logoutLink : "#top_logout_link",

		vkMessageContainerParentSelector : "li.im-mess",

		vkMessageIdAttribute : "data-msgid",


	};

	// DESKTOP MODE SELECTORS 2024
	this.nativeSelectors_v2024 = {
		form: ".ConvoMain__composerContent", // +
		chatBox : ".ConvoComposer__input", // +-
		chatBoxContainer : ".im-chat-input--textarea", // -- not used
		attachmentButton : ".ConvoComposer__clip", // + , not tested. Dropdown is enabled by additional class
		placeholder : ".placeholder", // -- not used
		smileButton : ".StickerEmojiMenuPopper", // -- not used
		sendButton : ".ConvoComposer__sendButton--mic,.ConvoComposer__sendButton--submit", // +-
		sendButton_voice : ".ConvoComposer__sendButton--mic",
		sendButton_message : ".ConvoComposer__sendButton--submit",
		windowContainer : ".ConvoComposer__inputPanel", // +-
		chatHistoryContainer : ".im-page--chat-body-wrap-inner",
		buttonsContainer : ".ConvoMain__composerContent.ConvoComposer", // -+
		dialogContainer : ".ConvoHistory__scrollbar-content",
		attachButtonImage : ".ms_item_more_label",

		// Part of the page which is always present in vk.com and should be tracked to know when user has entered PM section.
		vkBodyId : "page_body",

		// Selector for the current user identifier.
		vkAuthor : "#l_pr a:first",

		// Selector for fetching text messages. Text content of these nodes is the actual text of the message.
		messageTextNode : "div.im-mess--text.wall_module._im_log_body",

		// Selector for finding parent of the message for determining identifier of the message's author.
		messageGroupParent : ".ConvoStack,.ForwardedMessage", 

		messageAuthorLinkSelector : ".ConvoMessageHeader__authorLink,.ForwardedMessage__link", // +-

		// Selector to get message identifier from the parent.
		messageIdParent : "li.im-mess",

		vkIterateMessagesSelector : "span.MessageText",

		logoutLink : "#top_logout_link",

		vkMessageContainerParentSelector : ".VirtualScrollItem",

		vkMessageIdAttribute : "data-itemkey",
	};

	// MOBILE MODE SELECTORS
	this.mobile = {
		nativeSelectors : {
			form : ".uMailWrite",
			chatBox : ".uMailWrite__textarea",
			chatBoxContainer : ".uMailWrite__textareaContainer",
			// It is used only for positioning, actual button selector is not needed.
			attachmentButton : ".uMailWrite",
			placeholder : ".placeholder",
			smileButton : ".uMailWrite__button.uMailWrite__buttonStickers",
			sendButton : ".uMailWrite__button.uMailWrite__buttonSend",
			windowContainer : ".messenger__write",
			formContainer : ".messenger__footer",
			chatHistoryContainer : ".messenger__layer.messenger__layer_convo .messenger__body.ScrollView",
			buttonsContainer : "._im_media_selector.im-chat-input--selector",
			dialogContainer : "._im_peer_history.im-page-chat-contain",

			// Part of the page which is always present in vk.com and should be tracked to know when user has entered PM section.
			vkBody : ".layout:first",

			// Selector for the current user identifier.
			vkAuthor : ".vkuiSimpleCell.vkuiTappable.vkuiRootComponent",

			// Selector for fetching text messages. Text content of these nodes is the actual text of the message.
			//! Edited message or message with attachments may have additional tag which might cause incorrect text content.
			//! It is expected for edited messages since VKEncrypt protocol will not support editing of the messages.
			//! Media content encryption has the lowest priority.
			messageTextNode : "div.im-mess--text.wall_module._im_log_body",

			// Selector to get message identifier from the parent.
			messageIdParent : "li.im-mess",

			logoutLink : "#top_logout_link",

			vkIterateMessagesSelector : "div.mi_text",

			vkMessageContainerParentSelector : ".msg",

			vkMessageServerIdClassPart : "msg_id_",

			vkMessagePendingClass : "msg_pending",

			messageAuthorLinkSelector : ".msg__author",
		}
	};

	// IMAGES LINKS OR CONTENT
	this.images = {
		lock : "",
		unlock : "",
		key : "",
		newKey : "",
		send : "data:image/svg+xml;charset=utf-8,%3Csvg xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22 width%3D%2224%22 height%3D%2224%22 viewBox%3D%220 0 24 24%22%3E%3Cpath fill%3D%22%23828A99%22 d%3D%22M4.7 15.8c-.7 1.9-1.1 3.2-1.3 3.9-.6 2.4-1 2.9 1.1 1.8 2.1-1.1 12-6.7 14.3-7.9 2.9-1.6 2.9-1.5-.2-3.2-2.3-1.4-12.2-6.8-14-7.9s-1.7-.6-1.2 1.8c.2.8.6 2.1 1.3 3.9.5 1.3 1.6 2.3 3 2.5l5.8 1.1c.1 0 .1.1.1.1s0 .1-.1.1l-5.8 1.1c-1.3.4-2.5 1.3-3 2.7z%22%2F%3E%3C%2Fsvg%3E"
	};

	this.vkeIds = {
		enableCB : "vke-enable",
		enableCBImage : "vke-enable-image",

		form : "vke-form",

		messageWindow : "vke-textbox",
			messageBox : "vke-message-input",
			messageSend : "vke-message-send",

		buttonsWindow : "vke-buttons-container",
			disableCB : "vke-disable",
			disableCBImage : "vke-disable-image",
			setPasswordButton : "vke-set-password",
			setPasswordButtonImage : "vke-set-password-image",

		passwordWindow : "vke-password-window",
			passwordField : "vke-password-field",
			passwordOK : "vke-password-ok",
			passwordCancel : "vke-password-cancel",
			passwordDisplay : "vke-show-password",

		generatePasswordButton : "vke-generate-password",
		responseKeyButton : "vke-response-generate-password"
	};


	this.vkeSelectors = {
		enableCB : "#" + this.vkeIds.enableCB,
		enableCBImage : "#" + this.vkeIds.enableCBImage,

		form : "#" + this.vkeIds.form,

		messageWindow : "#" + this.vkeIds.messageWindow,
			messageBox : "#" + this.vkeIds.messageBox,
			messageSend : "#" + this.vkeIds.messageSend,

		buttonsWindow : "#" + this.vkeIds.buttonsWindow,
			disableCB : "#" + this.vkeIds.disableCB,
			disableCBImage : "#" + this.vkeIds.disableCBImage,
			setPasswordButton : "#" + this.vkeIds.setPasswordButton,
			setPasswordButtonImage : "#" + this.vkeIds.setPasswordButtonImage,

		passwordWindow : "#" + this.vkeIds.passwordWindow,
			passwordField : "#" + this.vkeIds.passwordField,
			passwordOK : "#" + this.vkeIds.passwordOK,
			passwordCancel : "#" + this.vkeIds.passwordCancel,
			passwordDisplay : "#" + this.vkeIds.passwordDisplay,

		generatePasswordButton : "#" + this.vkeIds.generatePasswordButton,
		generatePasswordButtonImage : "#" + this.vkeIds.generatePasswordButtonImage,

		responseKeyButton : "#" + this.vkeIds.responseKeyButton
	};

	this.html = {
		enableButton : "<div id='" + this.vkeIds.enableCB + "' style='width: 48px; height: 48px;'><image id='" + this.vkeIds.enableCBImage + "' style='width: 24px; height: 24px; margin-left: 12px;' src=''/></div>",
		generatePasswordButton : "<div><image id='" + this.vkeIds.generatePasswordButton + "' src=''/></div>",
		responseKeyButton : "<div><image id='" + this.vkeIds.responseKeyButton + "' src=''/></div>",
		form : "<div id='" + this.vkeIds.form + "' style='position: relative; padding-top: 8px; background: white; display: none; min-height: 120px; border: 1px solid #A7ADB7;'>"
				+ "	<div id='" + this.vkeIds.buttonsWindow + "' style='padding-left: 8px;'>"
				+ "		<div id='" + this.vkeIds.disableCB + "' style='width: 36px; height: 36px; margin-top: 48px;'>"
				+ "			<image id='" + this.vkeIds.disableCBImage + "' style='width: 24px; height: 24px; margin-top: 6px; margin-left: 6px;' src=''/>"
				+ "		</div>"
				+ "		<div id='" + this.vkeIds.setPasswordButton + "' style='width: 36px; height: 36px;'>"
				+ "			<image id='" + this.vkeIds.setPasswordButtonImage + "' style='width: 24px; height: 24px; margin-top: 6px; margin-left: 6px;' src=''/>"
				+ "		</div>"
				+ "		<div id='" + this.vkeIds.generatePasswordButton + "' style='width: 36px; height: 36px; display: none;'>"
				+ "			<image id='" + this.vkeIds.generatePasswordButtonImage + "' style='width: 24px; height: 24px; margin-top: 6px; margin-left: 6px;' src=''/>"
				+ "		</div>"
				+ "	</div>"
				+ "	<div style='position: absolute; left: 52px; right: 0px; top: 8px;'>"
				+ "		<div>"
				+ "			<div id='" + this.vkeIds.messageWindow + "' style=''>"
				+ "				<div style='overflow: hidden;'>"
				+ "					<div id='" + this.vkeIds.messageSend + "' style='width: 36px; height: 48px; margin-left: 16px; margin-top : 16px; float: right;'>"
				+ "						<image src='" + this.images.send + "' draggable='false' />"
				+ "					</div>"
				+ "					<div style='overflow: auto;'>"
				+ "						<textarea id='" + this.vkeIds.messageBox + "' style='-webkit-box-sizing: border-box; -moz-box-sizing: border-box; box-sizing: border-box; resize: vertical; min-height: 48px; max-height: 190px; width: 100%'></textarea>"
				+ "					</div>"
				+ "				</div>"
				+ "			</div>"
				+ "			<div id='" + this.vkeIds.passwordWindow + "' style='max-width: 600px; margin-left: auto; margin-right: auto; display: none'>"
				+ "				<div>Пароль: </div>"
				+ "				<div style='width: 100%; margin-top: 8px;'><input id='" + this.vkeIds.passwordField + "' type='password' style='width: 90%'/></div>"
				+ "				<div style='margin-top: 8px;'><input id='" + this.vkeIds.passwordDisplay + "' type='checkbox' value='false'>Показать пароль</input></div>"
				+ "				<div style='overflow: hidden; margin-top: 8px; margin-bottom: 8px; width: 90%;'>"
				+ "					<div id='" + this.vkeIds.passwordOK + "' style='border: 1px solid #A7ADB7; float: right; width: 40%; background: lightgreen; text-align: center;'>OK</div>"
				+ "					<div id='" + this.vkeIds.passwordCancel + "' style='border: 1px solid #A7ADB7; width: 40%; background: palevioletred; text-align: center;'>Отмена</div>"
				+ "				</div>"
				+ "			</div>"
				+ "		</div>"
				+ "	</div>"
				+ "</div>"
	};

	this.alerts = {
		messageIsTooLong : "Сообщение слишком большое. Пожалуйста, поделите сообщение на несколько частей.",
		passwordIsTooLong : "Длина парольной фразы превышает максимально допустимую. Пожалуйста, используйте другую парольную фразу."
	};

	this.text = {
		keyExchangeRequest : "Запрос на создание ключа для одноразовой переписки. ",
		keyExchangePressButton : "Нажмите на кнопку для подтверждения. ",
		keyExchangeResponse : "Подтверждение создания ключа для одноразовой переписки. ",
		keyExchangeRequestTimeout : "Запрос более не действителен. ",
		keyExchangeResponseTimeout: "Подтверждение более не действительно. ",
		keyIsGenerated : "Общий секретный ключ для одноразовой переписки сгенерирован. "
	};

	return this;
}();