# DeepSeek Live

**대화는 이어가고, 깊은 생각은 따로.**

[English](README.md) · [기술 조사](docs/RESEARCH.ko.md) · [구조](docs/ARCHITECTURE.md)

DeepSeek 스트리밍 응답과 브라우저 음성 기능을 연결한 독립 오픈소스 프로젝트입니다. 대화 중 답변을 끊거나, 심층 분석을 시작한 뒤 다른 질문을 이어갈 수 있습니다.

GPT-Live의 대화와 추론 분리에서 아이디어를 얻었습니다. **GPT-Live 모델을 복제한 프로젝트가 아니며, 네이티브 full-duplex 음성 모델도 아닙니다.** 현재 구조는 음성 인식 → DeepSeek 텍스트 모델 → 음성 합성입니다.

## 바로 실행

Node.js 22.9 이상이 필요합니다. 외부 패키지 설치는 필요 없습니다.

```bash
git clone https://github.com/hangi7890/deepseek-live.git
cd deepseek-live
npm start
```

http://127.0.0.1:3000 을 엽니다. API 키가 없으면 **질문과 무관한 고정 데모 답변**이 나오며, 화면에 SCRIPTED DEMO가 표시됩니다.

실제 DeepSeek 연결:

```bash
cp .env.example .env
# .env에 DEEPSEEK_API_KEY를 입력하고 서버 재시작
npm start
```

기본 모델은 `deepseek-flash`입니다. 일반 대화는 thinking 비활성화, Deep think는 활성화합니다. API 사용료는 사용자 계정에서 발생합니다. API 키는 서버의 `.env`에만 넣으세요. Settings의 토큰 입력칸은 원격 공유 시 쓰는 별도 접근 암호입니다.

## 사용법

- **Start listening**: 마이크를 켭니다. Chrome과 헤드폰 사용을 권장합니다.
- **Settings → 한국어**: 한국어 음성 인식·응답·음성 출력을 선택합니다. UI는 현재 영어입니다.
- **Deep think**: 별도의 분석 요청을 보냅니다. 최대 두 개의 분석을 실행하면서 대화할 수 있습니다.
- **Interrupt / Escape**: 현재 대화 응답과 재생만 중단합니다. 분석은 계속됩니다.
- **Cancel analysis**: 해당 분석만 중단합니다.
- **Discuss result**: 분석 내용을 대화 입력칸에 가져옵니다. 전송하면 그 내용을 질문에 포함합니다.
- **New session**: 대화와 분석을 초기화합니다. 창을 닫으면 백그라운드 분석도 종료됩니다.

음성 인식은 브라우저별 지원 차이가 있으며 외부 음성 서비스로 전송될 수 있습니다. 음성 인식이 없는 브라우저에서도 텍스트 대화는 가능합니다. 화면의 지연시간은 서버 측 첫 텍스트 토큰 시간이며, 마이크부터 실제 소리가 나올 때까지의 지연시간과 다릅니다.

## 공개 범위와 한계

구현된 기능은 스트리밍 대화, 문장 단위 음성 출력, 독립 분석, 취소 처리, 접근 제한입니다. 감정·운율을 이해하는 음성 모델, 학습된 발화 타이밍, 자동 도구 호출, 웹 검색, GPU 상태 이동은 구현하지 않았습니다. GPT-Live와 동등한 성능을 주장하지 않습니다.

[조사 문서](docs/RESEARCH.ko.md)에 공식 자료·논문·기사·인터뷰를 구분하고, 확인한 사실과 이번 프로젝트의 설계 판단을 나누었습니다. 공유 서버 설정은 [영문 README](README.md#self-hosting), 검증 범위는 [검증 기록](docs/VALIDATION.md)을 참고하세요.

```bash
npm run check
npm test
npm run smoke
```

버그 재현 사례, 음성 백엔드 통합, 한국어 UX, 접근성 개선을 환영합니다. 유용했다면 GitHub Star로 알려주세요. MIT 라이선스이며 DeepSeek·OpenAI와 공식 관계가 없습니다.
