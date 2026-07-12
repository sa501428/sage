#import <Cocoa/Cocoa.h>
#import <WebKit/WebKit.h>

@interface AppDelegate : NSObject <NSApplicationDelegate, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate>
@property(strong) NSWindow *window;
@property(strong) WKWebView *webView;
@property(strong) NSURL *appDirectoryURL;
@end

@implementation AppDelegate

- (void)applicationDidFinishLaunching:(NSNotification *)notification {
  (void)notification;

  NSURL *indexURL = [[NSBundle mainBundle] URLForResource:@"index" withExtension:@"html" subdirectory:@"app"];
  self.appDirectoryURL = [indexURL URLByDeletingLastPathComponent];
  if (!indexURL || !self.appDirectoryURL) {
    NSAlert *alert = [[NSAlert alloc] init];
    alert.messageText = @"SAGE could not find its bundled app files.";
    [alert runModal];
    [NSApp terminate:nil];
    return;
  }

  WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
  configuration.websiteDataStore = [WKWebsiteDataStore nonPersistentDataStore];
  configuration.suppressesIncrementalRendering = NO;
  configuration.allowsAirPlayForMediaPlayback = NO;
  if (@available(macOS 11.0, *)) {
    configuration.defaultWebpagePreferences.allowsContentJavaScript = YES;
  }
  if ([configuration.preferences respondsToSelector:@selector(setJavaScriptCanOpenWindowsAutomatically:)]) {
    configuration.preferences.javaScriptCanOpenWindowsAutomatically = NO;
  }

  NSRect frame = NSMakeRect(0, 0, 1280, 840);
  self.window = [[NSWindow alloc]
    initWithContentRect:frame
              styleMask:(NSWindowStyleMaskTitled |
                         NSWindowStyleMaskClosable |
                         NSWindowStyleMaskMiniaturizable |
                         NSWindowStyleMaskResizable)
                backing:NSBackingStoreBuffered
                  defer:NO];
  self.window.title = @"SAGE";
  self.window.minSize = NSMakeSize(980, 640);
  [self.window center];

  self.webView = [[WKWebView alloc] initWithFrame:self.window.contentView.bounds configuration:configuration];
  self.webView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  self.webView.navigationDelegate = self;
  self.webView.UIDelegate = self;
  [self.window.contentView addSubview:self.webView];

  [self.webView loadFileURL:indexURL allowingReadAccessToURL:self.appDirectoryURL];
  [self.window makeKeyAndOrderFront:nil];
}

- (BOOL)applicationSupportsSecureRestorableState:(NSApplication *)app {
  (void)app;
  return YES;
}

- (BOOL)applicationShouldTerminateAfterLastWindowClosed:(NSApplication *)sender {
  (void)sender;
  return YES;
}

- (BOOL)isAllowedURL:(NSURL *)url {
  if (!url) return NO;

  NSString *scheme = url.scheme.lowercaseString;
  if ([scheme isEqualToString:@"about"] || [scheme isEqualToString:@"blob"] || [scheme isEqualToString:@"data"]) {
    return YES;
  }

  if (![scheme isEqualToString:@"file"]) {
    return NO;
  }

  NSString *appPath = self.appDirectoryURL.path.stringByStandardizingPath;
  NSString *targetPath = url.path.stringByStandardizingPath;
  return [targetPath isEqualToString:appPath] || [targetPath hasPrefix:[appPath stringByAppendingString:@"/"]];
}

- (void)webView:(WKWebView *)webView
decidePolicyForNavigationAction:(WKNavigationAction *)navigationAction
decisionHandler:(void (^)(WKNavigationActionPolicy))decisionHandler {
  (void)webView;
  if (navigationAction.targetFrame == nil || ![self isAllowedURL:navigationAction.request.URL]) {
    decisionHandler(WKNavigationActionPolicyCancel);
    return;
  }
  decisionHandler(WKNavigationActionPolicyAllow);
}

- (void)webView:(WKWebView *)webView
decidePolicyForNavigationResponse:(WKNavigationResponse *)navigationResponse
decisionHandler:(void (^)(WKNavigationResponsePolicy))decisionHandler {
  (void)webView;
  if (![self isAllowedURL:navigationResponse.response.URL]) {
    decisionHandler(WKNavigationResponsePolicyCancel);
    return;
  }
  decisionHandler(WKNavigationResponsePolicyAllow);
}

- (WKWebView *)webView:(WKWebView *)webView
createWebViewWithConfiguration:(WKWebViewConfiguration *)configuration
forNavigationAction:(WKNavigationAction *)navigationAction
windowFeatures:(WKWindowFeatures *)windowFeatures {
  (void)webView;
  (void)configuration;
  (void)navigationAction;
  (void)windowFeatures;
  return nil;
}

- (void)webView:(WKWebView *)webView
runOpenPanelWithParameters:(WKOpenPanelParameters *)parameters
initiatedByFrame:(WKFrameInfo *)frame
completionHandler:(void (^)(NSArray<NSURL *> * _Nullable URLs))completionHandler {
  (void)webView;
  (void)frame;

  NSOpenPanel *panel = [NSOpenPanel openPanel];
  panel.canChooseFiles = YES;
  panel.canChooseDirectories = NO;
  panel.allowsMultipleSelection = parameters.allowsMultipleSelection;

  [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
    completionHandler(result == NSModalResponseOK ? panel.URLs : nil);
  }];
}

- (void)webView:(WKWebView *)webView
navigationAction:(WKNavigationAction *)navigationAction
didBecomeDownload:(WKDownload *)download API_AVAILABLE(macos(11.3)) {
  (void)webView;
  (void)navigationAction;
  download.delegate = self;
}

- (void)webView:(WKWebView *)webView
navigationResponse:(WKNavigationResponse *)navigationResponse
didBecomeDownload:(WKDownload *)download API_AVAILABLE(macos(11.3)) {
  (void)webView;
  (void)navigationResponse;
  download.delegate = self;
}

- (void)download:(WKDownload *)download
decideDestinationUsingResponse:(NSURLResponse *)response
suggestedFilename:(NSString *)suggestedFilename
completionHandler:(void (^)(NSURL * _Nullable destination))completionHandler API_AVAILABLE(macos(11.3)) {
  (void)download;
  (void)response;

  NSSavePanel *panel = [NSSavePanel savePanel];
  panel.nameFieldStringValue = suggestedFilename ?: @"sage-export";
  [panel beginSheetModalForWindow:self.window completionHandler:^(NSModalResponse result) {
    completionHandler(result == NSModalResponseOK ? panel.URL : nil);
  }];
}

@end

int main(int argc, const char *argv[]) {
  (void)argc;
  (void)argv;

  @autoreleasepool {
    NSApplication *application = [NSApplication sharedApplication];
    application.activationPolicy = NSApplicationActivationPolicyRegular;

    AppDelegate *delegate = [[AppDelegate alloc] init];
    application.delegate = delegate;
    [application run];
  }

  return 0;
}
