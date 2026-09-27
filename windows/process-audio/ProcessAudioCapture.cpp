#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <audioclient.h>
#include <audioclientactivationparams.h>
#include <mmdeviceapi.h>
#include <functiondiscoverykeys_devpkey.h>
#include <wrl.h>
#include <wrl/implements.h>
#include <fcntl.h>
#include <io.h>

#include <cstdint>
#include <cstdio>
#include <cwchar>
#include <cwctype>
#include <string>
#include <vector>

using Microsoft::WRL::ComPtr;
using Microsoft::WRL::FtmBase;
using Microsoft::WRL::Make;
using Microsoft::WRL::RuntimeClass;
using Microsoft::WRL::RuntimeClassFlags;
using Microsoft::WRL::ClassicCom;

namespace {
constexpr UINT32 kSampleRate = 48000;
constexpr WORD kChannels = 2;
constexpr WORD kBitsPerSample = 16;
constexpr DWORD kActivationTimeoutMs = 5000;

void print_hresult(const wchar_t* prefix, HRESULT hr) {
  wchar_t message[512] = {};
  FormatMessageW(
      FORMAT_MESSAGE_FROM_SYSTEM | FORMAT_MESSAGE_IGNORE_INSERTS,
      nullptr,
      static_cast<DWORD>(hr),
      MAKELANGID(LANG_NEUTRAL, SUBLANG_DEFAULT),
      message,
      static_cast<DWORD>(std::size(message)),
      nullptr);
  fwprintf(stderr, L"YAMACHAT_PROCESS_AUDIO_ERROR %ls hr=0x%08lx %ls\n",
           prefix, static_cast<unsigned long>(hr), message);
  fflush(stderr);
}

bool write_all(HANDLE handle, const BYTE* data, DWORD size) {
  DWORD offset = 0;
  while (offset < size) {
    DWORD written = 0;
    if (!WriteFile(handle, data + offset, size - offset, &written, nullptr) || written == 0) {
      return false;
    }
    offset += written;
  }
  return true;
}

class ActivationHandler final
    : public RuntimeClass<RuntimeClassFlags<ClassicCom>,
                          IActivateAudioInterfaceCompletionHandler,
                          FtmBase> {
 public:
  ActivationHandler() : event_(CreateEventW(nullptr, FALSE, FALSE, nullptr)) {}
  ~ActivationHandler() override {
    if (event_) CloseHandle(event_);
  }

  STDMETHODIMP ActivateCompleted(IActivateAudioInterfaceAsyncOperation* operation) override {
    HRESULT activateResult = E_UNEXPECTED;
    ComPtr<IUnknown> unknown;
    HRESULT hr = operation->GetActivateResult(&activateResult, &unknown);
    if (SUCCEEDED(hr)) hr = activateResult;
    if (SUCCEEDED(hr)) hr = unknown.As(&client_);
    result_ = hr;
    if (event_) SetEvent(event_);
    return S_OK;
  }

  HANDLE event() const { return event_; }
  HRESULT result() const { return result_; }
  ComPtr<IAudioClient> client() const { return client_; }

 private:
  HANDLE event_ = nullptr;
  HRESULT result_ = E_PENDING;
  ComPtr<IAudioClient> client_;
};

HRESULT activate_process_loopback(DWORD processId, bool excludeTree, ComPtr<IAudioClient>& client) {
  AUDIOCLIENT_ACTIVATION_PARAMS params = {};
  params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;
  params.ProcessLoopbackParams.TargetProcessId = processId;
  params.ProcessLoopbackParams.ProcessLoopbackMode =
      excludeTree ? PROCESS_LOOPBACK_MODE_EXCLUDE_TARGET_PROCESS_TREE : PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE;

  PROPVARIANT activation = {};
  PropVariantInit(&activation);
  activation.vt = VT_BLOB;
  activation.blob.cbSize = sizeof(params);
  activation.blob.pBlobData = reinterpret_cast<BYTE*>(&params);

  auto handler = Make<ActivationHandler>();
  if (!handler || !handler->event()) return E_OUTOFMEMORY;

  ComPtr<IActivateAudioInterfaceAsyncOperation> operation;
  HRESULT hr = ActivateAudioInterfaceAsync(
      VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
      __uuidof(IAudioClient),
      &activation,
      handler.Get(),
      &operation);
  if (FAILED(hr)) return hr;

  const DWORD wait = WaitForSingleObject(handler->event(), kActivationTimeoutMs);
  if (wait != WAIT_OBJECT_0) return HRESULT_FROM_WIN32(wait == WAIT_TIMEOUT ? ERROR_TIMEOUT : GetLastError());

  hr = handler->result();
  if (FAILED(hr)) return hr;
  client = handler->client();
  return client ? S_OK : E_NOINTERFACE;
}

DWORD resolve_pid_from_hwnd(uint64_t rawHwnd) {
  HWND hwnd = reinterpret_cast<HWND>(static_cast<uintptr_t>(rawHwnd));
  if (!hwnd) return 0;
  DWORD pid = 0;
  GetWindowThreadProcessId(hwnd, &pid);
  return pid;
}

bool parse_u64(const wchar_t* text, uint64_t& value) {
  if (!text || !*text) return false;
  wchar_t* end = nullptr;
  const unsigned long long parsed = wcstoull(text, &end, 10);
  if (!end || *end != L'\0' || parsed == 0) return false;
  value = static_cast<uint64_t>(parsed);
  return true;
}

DWORD integrity_level(HANDLE process) {
  HANDLE token = nullptr;
  if (!OpenProcessToken(process, TOKEN_QUERY, &token)) return 0;
  DWORD length = 0;
  GetTokenInformation(token, TokenIntegrityLevel, nullptr, 0, &length);
  std::vector<BYTE> data(length);
  DWORD level = 0;
  if (length && GetTokenInformation(token, TokenIntegrityLevel, data.data(), length, &length)) {
    auto label = reinterpret_cast<TOKEN_MANDATORY_LABEL*>(data.data());
    auto count = *GetSidSubAuthorityCount(label->Label.Sid);
    if (count) level = *GetSidSubAuthority(label->Label.Sid, count - 1);
  }
  CloseHandle(token);
  return level;
}

bool virtual_default_output() {
  ComPtr<IMMDeviceEnumerator> enumerator;
  if (FAILED(CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, IID_PPV_ARGS(&enumerator)))) return true;
  ComPtr<IMMDevice> device;
  if (FAILED(enumerator->GetDefaultAudioEndpoint(eRender, eConsole, &device))) return true;
  ComPtr<IPropertyStore> properties;
  if (FAILED(device->OpenPropertyStore(STGM_READ, &properties))) return true;
  PROPVARIANT name; PropVariantInit(&name);
  if (FAILED(properties->GetValue(PKEY_Device_FriendlyName, &name))) return true;
  std::wstring label = name.vt == VT_LPWSTR && name.pwszVal ? name.pwszVal : L"";
  PropVariantClear(&name);
  fwprintf(stderr, L"YAMACHAT_PROCESS_AUDIO_OUTPUT %ls\n", label.c_str());
  for (auto& character : label) character = towlower(character);
  // A virtual mixer can render Yamachat's audio again under a different PID.
  // Excluding our process tree cannot remove that second rendering safely.
  for (const auto* marker : {L"fxsound", L"voicemeeter", L"vb-audio", L"virtual", L"sonar", L"steam streaming"}) {
    if (label.find(marker) != std::wstring::npos) return true;
  }
  return label.empty();
}

int capture_process(DWORD processId, bool excludeTree) {
  HANDLE target = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, processId);
  const DWORD targetError = target ? 0 : GetLastError();
  const DWORD ownLevel = integrity_level(GetCurrentProcess());
  const DWORD targetLevel = target ? integrity_level(target) : 0;
  if (target) CloseHandle(target);
  fwprintf(stderr, L"YAMACHAT_PROCESS_AUDIO_DIAGNOSTIC helperIntegrity=%lu targetIntegrity=%lu targetError=%lu exclusion=%u\n",
           ownLevel, targetLevel, targetError, excludeTree ? 1u : 0u);
  fflush(stderr);
  HRESULT hr = CoInitializeEx(nullptr, COINIT_MULTITHREADED);
  const bool comInitialized = SUCCEEDED(hr);
  if (FAILED(hr) && hr != RPC_E_CHANGED_MODE) {
    print_hresult(L"CoInitializeEx", hr);
    return 10;
  }
  if (excludeTree && virtual_default_output()) {
    fwprintf(stderr, L"YAMACHAT_PROCESS_AUDIO_ERROR VIRTUAL_AUDIO_ROUTE: use a direct speaker/headphone output or share an application; virtual mixers may replay excluded audio under another process.\n");
    fflush(stderr);
    if (comInitialized) CoUninitialize();
    return 18;
  }

  ComPtr<IAudioClient> audioClient;
  hr = activate_process_loopback(processId, excludeTree, audioClient);
  if (FAILED(hr)) {
    print_hresult(L"ActivateAudioInterfaceAsync", hr);
    if (comInitialized) CoUninitialize();
    return 11;
  }

  WAVEFORMATEX format = {};
  format.wFormatTag = WAVE_FORMAT_PCM;
  format.nChannels = kChannels;
  format.nSamplesPerSec = kSampleRate;
  format.wBitsPerSample = kBitsPerSample;
  format.nBlockAlign = format.nChannels * format.wBitsPerSample / 8;
  format.nAvgBytesPerSec = format.nSamplesPerSec * format.nBlockAlign;

  const DWORD streamFlags =
      AUDCLNT_STREAMFLAGS_LOOPBACK |
      AUDCLNT_STREAMFLAGS_EVENTCALLBACK |
      AUDCLNT_STREAMFLAGS_AUTOCONVERTPCM |
      AUDCLNT_STREAMFLAGS_SRC_DEFAULT_QUALITY;

  hr = audioClient->Initialize(
      AUDCLNT_SHAREMODE_SHARED,
      streamFlags,
      0,
      0,
      &format,
      nullptr);
  if (FAILED(hr)) {
    print_hresult(L"IAudioClient::Initialize", hr);
    if (comInitialized) CoUninitialize();
    return 12;
  }

  ComPtr<IAudioCaptureClient> captureClient;
  hr = audioClient->GetService(IID_PPV_ARGS(&captureClient));
  if (FAILED(hr)) {
    print_hresult(L"IAudioClient::GetService", hr);
    if (comInitialized) CoUninitialize();
    return 13;
  }

  HANDLE sampleEvent = CreateEventW(nullptr, FALSE, FALSE, nullptr);
  if (!sampleEvent) {
    fwprintf(stderr, L"YAMACHAT_PROCESS_AUDIO_ERROR CreateEvent error=%lu\n", GetLastError());
    if (comInitialized) CoUninitialize();
    return 14;
  }

  hr = audioClient->SetEventHandle(sampleEvent);
  if (FAILED(hr)) {
    print_hresult(L"IAudioClient::SetEventHandle", hr);
    CloseHandle(sampleEvent);
    if (comInitialized) CoUninitialize();
    return 15;
  }

  _setmode(_fileno(stdout), _O_BINARY);
  HANDLE output = GetStdHandle(STD_OUTPUT_HANDLE);
  if (!output || output == INVALID_HANDLE_VALUE) {
    fwprintf(stderr, L"YAMACHAT_PROCESS_AUDIO_ERROR stdout unavailable\n");
    CloseHandle(sampleEvent);
    if (comInitialized) CoUninitialize();
    return 16;
  }

  hr = audioClient->Start();
  if (FAILED(hr)) {
    print_hresult(L"IAudioClient::Start", hr);
    CloseHandle(sampleEvent);
    if (comInitialized) CoUninitialize();
    return 17;
  }

  fwprintf(stderr,
           L"YAMACHAT_PROCESS_AUDIO_READY pid=%lu rate=%u channels=%u bits=%u\n",
           processId, kSampleRate, kChannels, kBitsPerSample);
  fflush(stderr);

  std::vector<BYTE> silence;
  bool keepRunning = true;

  while (keepRunning) {
    const DWORD wait = WaitForSingleObject(sampleEvent, 1000);
    if (wait == WAIT_TIMEOUT) continue;
    if (wait != WAIT_OBJECT_0) break;

    UINT32 nextPacketFrames = 0;
    hr = captureClient->GetNextPacketSize(&nextPacketFrames);
    if (FAILED(hr)) {
      print_hresult(L"IAudioCaptureClient::GetNextPacketSize", hr);
      break;
    }

    while (nextPacketFrames > 0) {
      BYTE* data = nullptr;
      UINT32 frames = 0;
      DWORD flags = 0;
      hr = captureClient->GetBuffer(&data, &frames, &flags, nullptr, nullptr);
      if (FAILED(hr)) {
        print_hresult(L"IAudioCaptureClient::GetBuffer", hr);
        keepRunning = false;
        break;
      }

      const DWORD bytes = frames * format.nBlockAlign;
      const BYTE* payload = data;
      if ((flags & AUDCLNT_BUFFERFLAGS_SILENT) || !data) {
        silence.assign(bytes, 0);
        payload = silence.data();
      }

      if (bytes && !write_all(output, payload, bytes)) {
        keepRunning = false;
      }

      captureClient->ReleaseBuffer(frames);
      if (!keepRunning) break;

      hr = captureClient->GetNextPacketSize(&nextPacketFrames);
      if (FAILED(hr)) {
        print_hresult(L"IAudioCaptureClient::GetNextPacketSize", hr);
        keepRunning = false;
        break;
      }
    }
  }

  audioClient->Stop();
  CloseHandle(sampleEvent);
  if (comInitialized) CoUninitialize();
  return 0;
}
}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (argc == 2 && wcscmp(argv[1], L"--version") == 0) {
    fwprintf(stdout, L"Yamachat.ProcessAudioCapture 2\n");
    return 0;
  }

  if (argc != 3 || (wcscmp(argv[1], L"--hwnd") != 0 && wcscmp(argv[1], L"--pid") != 0 && wcscmp(argv[1], L"--exclude-pid") != 0)) {
    fwprintf(stderr, L"Usage: Yamachat.ProcessAudioCapture (--hwnd <window-handle> | --pid <process-id> | --exclude-pid <process-id>)\n");
    return 2;
  }

  uint64_t raw = 0;
  if (!parse_u64(argv[2], raw)) {
    fwprintf(stderr, L"YAMACHAT_PROCESS_AUDIO_ERROR invalid numeric target\n");
    return 3;
  }

  DWORD pid = 0;
  if (wcscmp(argv[1], L"--hwnd") != 0) {
    if (raw > MAXDWORD) {
      fwprintf(stderr, L"YAMACHAT_PROCESS_AUDIO_ERROR process id out of range\n");
      return 4;
    }
    pid = static_cast<DWORD>(raw);
  } else {
    pid = resolve_pid_from_hwnd(raw);
    if (!pid) {
      fwprintf(stderr, L"YAMACHAT_PROCESS_AUDIO_ERROR unable to resolve HWND to PID target=%llu error=%lu\n",
               static_cast<unsigned long long>(raw), GetLastError());
      return 5;
    }
  }

  return capture_process(pid, wcscmp(argv[1], L"--exclude-pid") == 0);
}
