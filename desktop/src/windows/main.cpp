#include <Windows.h>
#include <Shlwapi.h>
#include <WebView2.h>
#include <WebView2EnvironmentOptions.h>
#include <wrl.h>

#include <algorithm>
#include <cwctype>
#include <filesystem>
#include <string>

using Microsoft::WRL::Callback;
using Microsoft::WRL::ComPtr;

namespace {

HWND g_mainWindow = nullptr;
ComPtr<ICoreWebView2Controller> g_controller;
ComPtr<ICoreWebView2> g_webView;
std::wstring g_appUriPrefix;
std::filesystem::path g_userDataDir;

std::wstring toLower(std::wstring value) {
  std::transform(value.begin(), value.end(), value.begin(), [](wchar_t ch) {
    return static_cast<wchar_t>(towlower(ch));
  });
  return value;
}

std::filesystem::path moduleDirectory() {
  wchar_t buffer[MAX_PATH] = {};
  DWORD length = GetModuleFileNameW(nullptr, buffer, MAX_PATH);
  if (length == 0 || length == MAX_PATH) {
    return std::filesystem::current_path();
  }
  return std::filesystem::path(buffer).parent_path();
}

std::wstring pathToFileUri(const std::filesystem::path& path) {
  wchar_t buffer[4096] = {};
  DWORD length = static_cast<DWORD>(sizeof(buffer) / sizeof(buffer[0]));
  const std::wstring native = path.wstring();
  if (SUCCEEDED(UrlCreateFromPathW(native.c_str(), buffer, &length, 0))) {
    return std::wstring(buffer, length);
  }
  return L"";
}

bool startsWith(const std::wstring& text, const std::wstring& prefix) {
  return text.size() >= prefix.size() && text.compare(0, prefix.size(), prefix) == 0;
}

bool isAllowedUri(const wchar_t* rawUri) {
  if (!rawUri) return false;
  std::wstring uri = toLower(rawUri);

  if (startsWith(uri, L"about:blank") ||
      startsWith(uri, L"blob:") ||
      startsWith(uri, L"data:")) {
    return true;
  }

  return startsWith(uri, g_appUriPrefix);
}

std::filesystem::path makeEphemeralUserDataDir() {
  wchar_t temp[MAX_PATH] = {};
  DWORD length = GetTempPathW(MAX_PATH, temp);
  std::filesystem::path root = length > 0 ? std::filesystem::path(temp) : std::filesystem::temp_directory_path();
  return root / (L"sage-webview2-" + std::to_wstring(GetCurrentProcessId()));
}

void resizeWebView() {
  if (!g_controller || !g_mainWindow) return;
  RECT bounds = {};
  GetClientRect(g_mainWindow, &bounds);
  g_controller->put_Bounds(bounds);
}

void showStartupError(const std::wstring& message) {
  MessageBoxW(g_mainWindow, message.c_str(), L"SAGE", MB_ICONERROR | MB_OK);
}

void initializeWebView() {
  std::filesystem::path appDir = moduleDirectory() / L"app";
  std::filesystem::path indexPath = appDir / L"index.html";
  if (!std::filesystem::exists(indexPath)) {
    showStartupError(L"SAGE could not find app\\index.html beside the executable.");
    return;
  }

  std::wstring appPrefix = pathToFileUri(appDir);
  if (appPrefix.empty()) {
    showStartupError(L"SAGE could not resolve the bundled app path.");
    return;
  }
  if (appPrefix.back() != L'/') appPrefix.push_back(L'/');
  g_appUriPrefix = toLower(appPrefix);

  g_userDataDir = makeEphemeralUserDataDir();
  std::filesystem::create_directories(g_userDataDir);

  ComPtr<ICoreWebView2EnvironmentOptions> options =
      Microsoft::WRL::Make<CoreWebView2EnvironmentOptions>();
  options->put_AdditionalBrowserArguments(
      L"--disable-background-networking "
      L"--disable-sync "
      L"--disable-features=AutofillServerCommunication,OptimizationHints,MediaRouter,Translate "
      L"--no-first-run");

  HRESULT result = CreateCoreWebView2EnvironmentWithOptions(
      nullptr,
      g_userDataDir.wstring().c_str(),
      options.Get(),
      Callback<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler>(
          [indexPath](HRESULT envResult, ICoreWebView2Environment* environment) -> HRESULT {
            if (FAILED(envResult) || !environment) {
              showStartupError(L"SAGE could not initialize WebView2. Install the Microsoft Edge WebView2 Runtime.");
              return S_OK;
            }

            environment->CreateCoreWebView2Controller(
                g_mainWindow,
                Callback<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler>(
                    [indexPath](HRESULT controllerResult, ICoreWebView2Controller* controller) -> HRESULT {
                      if (FAILED(controllerResult) || !controller) {
                        showStartupError(L"SAGE could not create a WebView2 controller.");
                        return S_OK;
                      }

                      g_controller = controller;
                      g_controller->get_CoreWebView2(&g_webView);
                      resizeWebView();

                      ComPtr<ICoreWebView2Settings> settings;
                      if (g_webView && SUCCEEDED(g_webView->get_Settings(&settings)) && settings) {
                        settings->put_IsScriptEnabled(TRUE);
                        settings->put_IsWebMessageEnabled(FALSE);
                        settings->put_AreHostObjectsAllowed(FALSE);
                        settings->put_AreDefaultContextMenusEnabled(FALSE);
                        settings->put_AreDevToolsEnabled(FALSE);
                        settings->put_IsStatusBarEnabled(FALSE);
                      }

                      EventRegistrationToken token = {};
                      g_webView->add_NavigationStarting(
                          Callback<ICoreWebView2NavigationStartingEventHandler>(
                              [](ICoreWebView2*, ICoreWebView2NavigationStartingEventArgs* args) -> HRESULT {
                                LPWSTR uri = nullptr;
                                if (SUCCEEDED(args->get_Uri(&uri))) {
                                  const bool allowed = isAllowedUri(uri);
                                  CoTaskMemFree(uri);
                                  if (!allowed) {
                                    args->put_Cancel(TRUE);
                                  }
                                } else {
                                  args->put_Cancel(TRUE);
                                }
                                return S_OK;
                              }).Get(),
                          &token);

                      g_webView->add_NewWindowRequested(
                          Callback<ICoreWebView2NewWindowRequestedEventHandler>(
                              [](ICoreWebView2*, ICoreWebView2NewWindowRequestedEventArgs* args) -> HRESULT {
                                args->put_Handled(TRUE);
                                return S_OK;
                              }).Get(),
                          &token);

                      g_webView->add_PermissionRequested(
                          Callback<ICoreWebView2PermissionRequestedEventHandler>(
                              [](ICoreWebView2*, ICoreWebView2PermissionRequestedEventArgs* args) -> HRESULT {
                                args->put_State(COREWEBVIEW2_PERMISSION_STATE_DENY);
                                return S_OK;
                              }).Get(),
                          &token);

                      const std::wstring indexUri = pathToFileUri(indexPath);
                      if (indexUri.empty()) {
                        showStartupError(L"SAGE could not resolve app\\index.html.");
                        return S_OK;
                      }
                      g_webView->Navigate(indexUri.c_str());
                      return S_OK;
                    }).Get());
            return S_OK;
          }).Get());

  if (FAILED(result)) {
    showStartupError(L"SAGE could not start WebView2. Install the Microsoft Edge WebView2 Runtime.");
  }
}

LRESULT CALLBACK windowProc(HWND hwnd, UINT message, WPARAM wparam, LPARAM lparam) {
  switch (message) {
    case WM_SIZE:
      resizeWebView();
      return 0;
    case WM_DESTROY:
      if (g_controller) {
        g_controller->Close();
      }
      g_webView.Reset();
      g_controller.Reset();
      if (!g_userDataDir.empty()) {
        std::error_code ignored;
        std::filesystem::remove_all(g_userDataDir, ignored);
      }
      PostQuitMessage(0);
      return 0;
    default:
      return DefWindowProcW(hwnd, message, wparam, lparam);
  }
}

}  // namespace

int WINAPI wWinMain(HINSTANCE instance, HINSTANCE, PWSTR, int commandShow) {
  HRESULT oleResult = OleInitialize(nullptr);
  if (FAILED(oleResult)) {
    MessageBoxW(nullptr, L"SAGE could not initialize OLE.", L"SAGE", MB_ICONERROR | MB_OK);
    return 1;
  }

  WNDCLASSEXW wc = {};
  wc.cbSize = sizeof(wc);
  wc.lpfnWndProc = windowProc;
  wc.hInstance = instance;
  wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
  wc.hIcon = LoadIcon(nullptr, IDI_APPLICATION);
  wc.hIconSm = LoadIcon(nullptr, IDI_APPLICATION);
  wc.hbrBackground = reinterpret_cast<HBRUSH>(COLOR_WINDOW + 1);
  wc.lpszClassName = L"SAGEWindowClass";

  if (!RegisterClassExW(&wc)) {
    OleUninitialize();
    return 1;
  }

  g_mainWindow = CreateWindowExW(
      0,
      wc.lpszClassName,
      L"SAGE",
      WS_OVERLAPPEDWINDOW,
      CW_USEDEFAULT,
      CW_USEDEFAULT,
      1280,
      840,
      nullptr,
      nullptr,
      instance,
      nullptr);

  if (!g_mainWindow) {
    OleUninitialize();
    return 1;
  }

  ShowWindow(g_mainWindow, commandShow);
  UpdateWindow(g_mainWindow);
  initializeWebView();

  MSG message = {};
  while (GetMessageW(&message, nullptr, 0, 0) > 0) {
    TranslateMessage(&message);
    DispatchMessageW(&message);
  }

  OleUninitialize();
  return static_cast<int>(message.wParam);
}
