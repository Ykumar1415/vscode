/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableStore } from 'vs/base/common/lifecycle';
import { Schemas } from 'vs/base/common/network';
import { isMacintosh } from 'vs/base/common/platform';
import { Emitter } from 'vs/base/common/event';
import * as nls from 'vs/nls';
import { Extensions as ConfigurationExtensions, IConfigurationRegistry } from 'vs/platform/configuration/common/configurationRegistry';
import { SyncDescriptor } from 'vs/platform/instantiation/common/descriptors';
import { InstantiationType, registerSingleton } from 'vs/platform/instantiation/common/extensions';
import { IInstantiationService } from 'vs/platform/instantiation/common/instantiation';
import { Registry } from 'vs/platform/registry/common/platform';
import { EditorPaneDescriptor, IEditorPaneRegistry } from 'vs/workbench/browser/editor';
import { IWorkbenchContributionsRegistry, WorkbenchPhase, Extensions as WorkbenchExtensions, registerWorkbenchContribution2 } from 'vs/workbench/common/contributions';
import { EditorExtensions, IEditorFactoryRegistry } from 'vs/workbench/common/editor';
import { registerChatActions } from 'vs/workbench/contrib/chat/browser/actions/chatActions';
import { registerChatCodeBlockActions } from 'vs/workbench/contrib/chat/browser/actions/chatCodeblockActions';
import { registerChatCopyActions } from 'vs/workbench/contrib/chat/browser/actions/chatCopyActions';
import { IChatExecuteActionContext, SubmitAction, registerChatExecuteActions } from 'vs/workbench/contrib/chat/browser/actions/chatExecuteActions';
import { registerQuickChatActions } from 'vs/workbench/contrib/chat/browser/actions/chatQuickInputActions';
import { registerChatTitleActions } from 'vs/workbench/contrib/chat/browser/actions/chatTitleActions';
import { registerChatExportActions } from 'vs/workbench/contrib/chat/browser/actions/chatImportExport';
import { IChatAccessibilityService, IChatWidget, IChatWidgetService, IQuickChatService } from 'vs/workbench/contrib/chat/browser/chat';
import { ChatContributionService } from 'vs/workbench/contrib/chat/browser/chatContributionServiceImpl';
import { ChatEditor, IChatEditorOptions } from 'vs/workbench/contrib/chat/browser/chatEditor';
import { ChatEditorInput, ChatEditorInputSerializer } from 'vs/workbench/contrib/chat/browser/chatEditorInput';
import { ChatWidgetService } from 'vs/workbench/contrib/chat/browser/chatWidget';
import 'vs/workbench/contrib/chat/browser/contrib/chatInputEditorContrib';
import 'vs/workbench/contrib/chat/browser/contrib/chatHistoryVariables';
import { IChatContributionService } from 'vs/workbench/contrib/chat/common/chatContributionService';
import { CHAT_FEATURE_ID, IChatService } from 'vs/workbench/contrib/chat/common/chatService';
import { ChatService } from 'vs/workbench/contrib/chat/common/chatServiceImpl';
import { ChatWidgetHistoryService, IChatWidgetHistoryService } from 'vs/workbench/contrib/chat/common/chatWidgetHistoryService';
import { IEditorResolverService, RegisteredEditorPriority } from 'vs/workbench/services/editor/common/editorResolverService';
import { LifecyclePhase } from 'vs/workbench/services/lifecycle/common/lifecycle';
import '../common/chatColors';
import { registerMoveActions } from 'vs/workbench/contrib/chat/browser/actions/chatMoveActions';
import { ACTION_ID_NEW_CHAT, registerNewChatActions } from 'vs/workbench/contrib/chat/browser/actions/chatClearActions';
import { AccessibleViewType, IAccessibleViewService } from 'vs/workbench/contrib/accessibility/browser/accessibleView';
import { isResponseVM } from 'vs/workbench/contrib/chat/common/chatViewModel';
import { CONTEXT_IN_CHAT_SESSION } from 'vs/workbench/contrib/chat/common/chatContextKeys';
import { ChatAccessibilityService } from 'vs/workbench/contrib/chat/browser/chatAccessibilityService';
import { ICodeEditorService } from 'vs/editor/browser/services/codeEditorService';
import { AccessibilityVerbositySettingId, AccessibleViewProviderId } from 'vs/workbench/contrib/accessibility/browser/accessibilityConfiguration';
import { ChatWelcomeMessageModel } from 'vs/workbench/contrib/chat/common/chatModel';
import { IMarkdownString, MarkdownString, isMarkdownString } from 'vs/base/common/htmlContent';
import { ChatProviderService, IChatProviderService } from 'vs/workbench/contrib/chat/common/chatProvider';
import { ChatSlashCommandService, IChatSlashCommandService } from 'vs/workbench/contrib/chat/common/chatSlashCommands';
import { alertFocusChange } from 'vs/workbench/contrib/accessibility/browser/accessibilityContributions';
import { AccessibleViewAction } from 'vs/workbench/contrib/accessibility/browser/accessibleViewActions';
import { ICommandService } from 'vs/platform/commands/common/commands';
import { IChatVariablesService } from 'vs/workbench/contrib/chat/common/chatVariables';
import { registerChatFileTreeActions } from 'vs/workbench/contrib/chat/browser/actions/chatFileTreeActions';
import { QuickChatService } from 'vs/workbench/contrib/chat/browser/chatQuick';
import { ChatAgentService, IChatAgentService } from 'vs/workbench/contrib/chat/common/chatAgents';
import { ChatVariablesService } from 'vs/workbench/contrib/chat/browser/chatVariables';
import { chatAgentLeader, chatSubcommandLeader } from 'vs/workbench/contrib/chat/common/chatParserTypes';
import { CancellationToken } from 'vs/base/common/cancellation';
import { IExtensionFeatureMarkdownRenderer, Extensions as ExtensionFeaturesExtensions, IRenderedData, IExtensionFeaturesRegistry, IExtensionFeaturesManagementService } from 'vs/workbench/services/extensionManagement/common/extensionFeatures';
import { ExtensionIdentifier, IExtensionManifest } from 'vs/platform/extensions/common/extensions';
import { getExtensionId } from 'vs/platform/extensionManagement/common/extensionManagementUtil';

// Register configuration
const configurationRegistry = Registry.as<IConfigurationRegistry>(ConfigurationExtensions.Configuration);
configurationRegistry.registerConfiguration({
	id: 'chatSidebar',
	title: nls.localize('interactiveSessionConfigurationTitle', "Chat"),
	type: 'object',
	properties: {
		'chat.editor.fontSize': {
			type: 'number',
			description: nls.localize('interactiveSession.editor.fontSize', "Controls the font size in pixels in chat codeblocks."),
			default: isMacintosh ? 12 : 14,
		},
		'chat.editor.fontFamily': {
			type: 'string',
			description: nls.localize('interactiveSession.editor.fontFamily', "Controls the font family in chat codeblocks."),
			default: 'default'
		},
		'chat.editor.fontWeight': {
			type: 'string',
			description: nls.localize('interactiveSession.editor.fontWeight', "Controls the font weight in chat codeblocks."),
			default: 'default'
		},
		'chat.editor.wordWrap': {
			type: 'string',
			description: nls.localize('interactiveSession.editor.wordWrap', "Controls whether lines should wrap in chat codeblocks."),
			default: 'off',
			enum: ['on', 'off']
		},
		'chat.editor.lineHeight': {
			type: 'number',
			description: nls.localize('interactiveSession.editor.lineHeight', "Controls the line height in pixels in chat codeblocks. Use 0 to compute the line height from the font size."),
			default: 0
		}
	}
});


Registry.as<IEditorPaneRegistry>(EditorExtensions.EditorPane).registerEditorPane(
	EditorPaneDescriptor.create(
		ChatEditor,
		ChatEditorInput.EditorID,
		nls.localize('chat', "Chat")
	),
	[
		new SyncDescriptor(ChatEditorInput)
	]
);

class ChatResolverContribution extends Disposable {

	static readonly ID = 'workbench.contrib.chatResolver';

	constructor(
		@IEditorResolverService editorResolverService: IEditorResolverService,
		@IInstantiationService instantiationService: IInstantiationService,
	) {
		super();

		this._register(editorResolverService.registerEditor(
			`${Schemas.vscodeChatSesssion}:**/**`,
			{
				id: ChatEditorInput.EditorID,
				label: nls.localize('chat', "Chat"),
				priority: RegisteredEditorPriority.builtin
			},
			{
				singlePerResource: true,
				canSupportResource: resource => resource.scheme === Schemas.vscodeChatSesssion
			},
			{
				createEditorInput: ({ resource, options }) => {
					return { editor: instantiationService.createInstance(ChatEditorInput, resource, options as IChatEditorOptions), options };
				}
			}
		));
	}
}

class ChatAccessibleViewContribution extends Disposable {
	static ID: 'chatAccessibleViewContribution';
	constructor() {
		super();
		this._register(AccessibleViewAction.addImplementation(100, 'panelChat', accessor => {
			const accessibleViewService = accessor.get(IAccessibleViewService);
			const widgetService = accessor.get(IChatWidgetService);
			const codeEditorService = accessor.get(ICodeEditorService);
			return renderAccessibleView(accessibleViewService, widgetService, codeEditorService, true);
			function renderAccessibleView(accessibleViewService: IAccessibleViewService, widgetService: IChatWidgetService, codeEditorService: ICodeEditorService, initialRender?: boolean): boolean {
				const widget = widgetService.lastFocusedWidget;
				if (!widget) {
					return false;
				}
				const chatInputFocused = initialRender && !!codeEditorService.getFocusedCodeEditor();
				if (initialRender && chatInputFocused) {
					widget.focusLastMessage();
				}

				if (!widget) {
					return false;
				}

				const verifiedWidget: IChatWidget = widget;
				const focusedItem = verifiedWidget.getFocus();

				if (!focusedItem) {
					return false;
				}

				widget.focus(focusedItem);
				const isWelcome = focusedItem instanceof ChatWelcomeMessageModel;
				let responseContent = isResponseVM(focusedItem) ? focusedItem.response.asString() : undefined;
				if (isWelcome) {
					const welcomeReplyContents = [];
					for (const content of focusedItem.content) {
						if (Array.isArray(content)) {
							welcomeReplyContents.push(...content.map(m => m.message));
						} else {
							welcomeReplyContents.push((content as IMarkdownString).value);
						}
					}
					responseContent = welcomeReplyContents.join('\n');
				}
				if (!responseContent && 'errorDetails' in focusedItem && focusedItem.errorDetails) {
					responseContent = focusedItem.errorDetails.message;
				}
				if (!responseContent) {
					return false;
				}
				const responses = verifiedWidget.viewModel?.getItems().filter(i => isResponseVM(i));
				const length = responses?.length;
				const responseIndex = responses?.findIndex(i => i === focusedItem);

				accessibleViewService.show({
					id: AccessibleViewProviderId.Chat,
					verbositySettingKey: AccessibilityVerbositySettingId.Chat,
					provideContent(): string { return responseContent; },
					onClose() {
						verifiedWidget.reveal(focusedItem);
						if (chatInputFocused) {
							verifiedWidget.focusInput();
						} else {
							verifiedWidget.focus(focusedItem);
						}
					},
					next() {
						verifiedWidget.moveFocus(focusedItem, 'next');
						alertFocusChange(responseIndex, length, 'next');
						renderAccessibleView(accessibleViewService, widgetService, codeEditorService);
					},
					previous() {
						verifiedWidget.moveFocus(focusedItem, 'previous');
						alertFocusChange(responseIndex, length, 'previous');
						renderAccessibleView(accessibleViewService, widgetService, codeEditorService);
					},
					options: { type: AccessibleViewType.View }
				});
				return true;
			}
		}, CONTEXT_IN_CHAT_SESSION));
	}
}

class ChatSlashStaticSlashCommandsContribution extends Disposable {

	constructor(
		@IChatSlashCommandService slashCommandService: IChatSlashCommandService,
		@ICommandService commandService: ICommandService,
		@IChatAgentService chatAgentService: IChatAgentService,
	) {
		super();
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'newChat',
			detail: nls.localize('newChat', "Start a new chat"),
			sortText: 'z2_newChat',
			executeImmediately: true
		}, async () => {
			commandService.executeCommand(ACTION_ID_NEW_CHAT);
		}));
		this._store.add(slashCommandService.registerSlashCommand({
			command: 'help',
			detail: '',
			sortText: 'z1_help',
			executeImmediately: true
		}, async (prompt, progress) => {
			const defaultAgent = chatAgentService.getDefaultAgent();
			const agents = chatAgentService.getAgents();
			if (defaultAgent?.metadata.helpTextPrefix) {
				if (isMarkdownString(defaultAgent.metadata.helpTextPrefix)) {
					progress.report({ content: defaultAgent.metadata.helpTextPrefix, kind: 'markdownContent' });
				} else {
					progress.report({ content: defaultAgent.metadata.helpTextPrefix, kind: 'content' });
				}
				progress.report({ content: '\n\n', kind: 'content' });
			}

			const agentText = (await Promise.all(agents
				.filter(a => a.id !== defaultAgent?.id)
				.map(async a => {
					const agentWithLeader = `${chatAgentLeader}${a.id}`;
					const actionArg: IChatExecuteActionContext = { inputValue: `${agentWithLeader} ${a.metadata.sampleRequest}` };
					const urlSafeArg = encodeURIComponent(JSON.stringify(actionArg));
					const agentLine = `* [\`${agentWithLeader}\`](command:${SubmitAction.ID}?${urlSafeArg}) - ${a.metadata.description}`;
					const commands = await a.provideSlashCommands(CancellationToken.None);
					const commandText = commands.map(c => {
						const actionArg: IChatExecuteActionContext = { inputValue: `${agentWithLeader} ${chatSubcommandLeader}${c.name} ${c.sampleRequest ?? ''}` };
						const urlSafeArg = encodeURIComponent(JSON.stringify(actionArg));
						return `\t* [\`${chatSubcommandLeader}${c.name}\`](command:${SubmitAction.ID}?${urlSafeArg}) - ${c.description}`;
					}).join('\n');

					return (agentLine + '\n' + commandText).trim();
				}))).join('\n');
			progress.report({ content: new MarkdownString(agentText, { isTrusted: { enabledCommands: [SubmitAction.ID] } }), kind: 'markdownContent' });
			if (defaultAgent?.metadata.helpTextPostfix) {
				progress.report({ content: '\n\n', kind: 'content' });
				if (isMarkdownString(defaultAgent.metadata.helpTextPostfix)) {
					progress.report({ content: defaultAgent.metadata.helpTextPostfix, kind: 'markdownContent' });
				} else {
					progress.report({ content: defaultAgent.metadata.helpTextPostfix, kind: 'content' });
				}
			}
		}));
	}
}

class ChatFeatureMarkdowneRenderer extends Disposable implements IExtensionFeatureMarkdownRenderer {

	readonly type = 'markdown';

	constructor(
		@IExtensionFeaturesManagementService private readonly extensionFeaturesManagementService: IExtensionFeaturesManagementService,
	) {
		super();
	}

	shouldRender(manifest: IExtensionManifest): boolean {
		const extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
		const accessData = this.extensionFeaturesManagementService.getAccessData(extensionId, CHAT_FEATURE_ID);
		return !!accessData;
	}

	render(manifest: IExtensionManifest): IRenderedData<IMarkdownString> {
		const disposables = new DisposableStore();
		const emitter = disposables.add(new Emitter<IMarkdownString>());
		const extensionId = new ExtensionIdentifier(getExtensionId(manifest.publisher, manifest.name));
		disposables.add(this.extensionFeaturesManagementService.onDidChangeAccessData(e => {
			if (ExtensionIdentifier.equals(e.extension, extensionId) && e.featureId === CHAT_FEATURE_ID) {
				emitter.fire(this.getMarkdownData(extensionId));
			}
		}));
		return {
			data: this.getMarkdownData(extensionId),
			onDidChange: emitter.event,
			dispose: () => { disposables.dispose(); }
		};
	}

	private getMarkdownData(extensionId: ExtensionIdentifier): IMarkdownString {
		const markdown = new MarkdownString();
		const accessData = this.extensionFeaturesManagementService.getAccessData(extensionId, CHAT_FEATURE_ID);
		if (accessData && accessData.totalCount) {
			if (accessData.current) {
				markdown.appendMarkdown(nls.localize('requests count session', "Requests (Session) : `{0}`", accessData.current.count));
				markdown.appendText('\n');
			}
			markdown.appendMarkdown(nls.localize('requests count total', "Requests (Overall): `{0}`", accessData.totalCount));
		}
		return markdown;
	}
}

Registry.as<IExtensionFeaturesRegistry>(ExtensionFeaturesExtensions.ExtensionFeaturesRegistry).registerExtensionFeature({
	id: CHAT_FEATURE_ID,
	label: nls.localize('chat', "Chat"),
	description: nls.localize('chatFeatureDescription', "Allows the extension to make requests to the Large Language Model (LLM)."),
	access: {
		canToggle: false,
	},
	renderer: new SyncDescriptor(ChatFeatureMarkdowneRenderer),
});

const workbenchContributionsRegistry = Registry.as<IWorkbenchContributionsRegistry>(WorkbenchExtensions.Workbench);
registerWorkbenchContribution2(ChatResolverContribution.ID, ChatResolverContribution, WorkbenchPhase.BlockStartup);
workbenchContributionsRegistry.registerWorkbenchContribution(ChatAccessibleViewContribution, LifecyclePhase.Eventually);
workbenchContributionsRegistry.registerWorkbenchContribution(ChatSlashStaticSlashCommandsContribution, LifecyclePhase.Eventually);
Registry.as<IEditorFactoryRegistry>(EditorExtensions.EditorFactory).registerEditorSerializer(ChatEditorInput.TypeID, ChatEditorInputSerializer);

registerChatActions();
registerChatCopyActions();
registerChatCodeBlockActions();
registerChatFileTreeActions();
registerChatTitleActions();
registerChatExecuteActions();
registerQuickChatActions();
registerChatExportActions();
registerMoveActions();
registerNewChatActions();

registerSingleton(IChatService, ChatService, InstantiationType.Delayed);
registerSingleton(IChatContributionService, ChatContributionService, InstantiationType.Delayed);
registerSingleton(IChatWidgetService, ChatWidgetService, InstantiationType.Delayed);
registerSingleton(IQuickChatService, QuickChatService, InstantiationType.Delayed);
registerSingleton(IChatAccessibilityService, ChatAccessibilityService, InstantiationType.Delayed);
registerSingleton(IChatWidgetHistoryService, ChatWidgetHistoryService, InstantiationType.Delayed);
registerSingleton(IChatProviderService, ChatProviderService, InstantiationType.Delayed);
registerSingleton(IChatSlashCommandService, ChatSlashCommandService, InstantiationType.Delayed);
registerSingleton(IChatAgentService, ChatAgentService, InstantiationType.Delayed);
registerSingleton(IChatVariablesService, ChatVariablesService, InstantiationType.Delayed);
