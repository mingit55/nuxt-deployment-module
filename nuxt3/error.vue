<template>
  <div class="error-container">
    <div class="error-card">
      <div class="error-icon">
        <svg
          v-if="error.statusCode === 404"
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="64"
          height="64"
        >
          <path fill="none" d="M0 0h24v24H0z" />
          <path
            d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm0-2a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm-1-5h2v2h-2v-2zm0-8h2v6h-2V7z"
            fill="currentColor"
          />
        </svg>
        <svg
          v-else
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          width="64"
          height="64"
        >
          <path fill="none" d="M0 0h24v24H0z" />
          <path
            d="M12 22C6.477 22 2 17.523 2 12S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10zm-1-7v2h2v-2h-2zm0-8v6h2V7h-2z"
            fill="currentColor"
          />
        </svg>
      </div>

      <h1 class="error-title">
        {{
          error.statusCode === 404
            ? '페이지를 찾을 수 없습니다'
            : '오류가 발생했습니다'
        }}
      </h1>

      <p class="error-message">
        {{
          error.statusCode === 404
            ? '요청하신 페이지가 존재하지 않거나 이동되었을 수 있습니다.'
            : '서비스 이용 중 문제가 발생했습니다. 잠시 후 다시 시도해 주세요.'
        }}
      </p>

      <p class="error-code">Error {{ error.statusCode || 'Unknown' }}</p>

      <button class="home-button" @click="handleError">
        <span class="button-icon">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            width="16"
            height="16"
          >
            <path fill="none" d="M0 0h24v24H0z" />
            <path
              d="M19 21H5a1 1 0 0 1-1-1v-9H1l10.327-9.388a1 1 0 0 1 1.346 0L23 11h-3v9a1 1 0 0 1-1 1zM6 19h12V9.157l-6-5.454-6 5.454V19z"
              fill="currentColor"
            />
          </svg>
        </span>
        홈으로 돌아가기
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  error: {
    type: Object,
    default: null,
  },
});

const handleError = () => {
  // Nuxt 3 방식으로 에러 처리 후 홈으로 이동
  clearError({ redirect: '/' });
};
</script>

<style lang="scss" scoped>
.error-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 2rem;
  background: linear-gradient(135deg, #f5f7fa 0%, #e4e8ec 100%);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen,
    Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;

  .error-card {
    width: 100%;
    max-width: 480px;
    padding: 3rem;
    border-radius: 16px;
    background-color: white;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.06), 0 2px 6px rgba(0, 0, 0, 0.04);
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .error-icon {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 96px;
    height: 96px;
    margin-bottom: 1.5rem;
    border-radius: 50%;
    color: #325eff;

    svg {
      color: #325eff;
    }
  }

  .error-title {
    margin: 0 0 1rem;
    font-size: 1.75rem;
    font-weight: 700;
    color: #2d3748;
  }

  .error-message {
    margin: 0 0 1.5rem;
    font-size: 1rem;
    line-height: 1.6;
    color: #64748b;
    word-break: keep-all;
  }

  .error-code {
    display: inline-block;
    margin: 0 0 2rem;
    padding: 0.25rem 1rem;
    border-radius: 1.5rem;
    background-color: #edf2f7;
    font-size: 0.875rem;
    font-weight: 500;
    color: #64748b;
  }

  .home-button {
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0.75rem 1.5rem;
    border: none;
    border-radius: 8px;
    background-color: #325eff;
    color: white;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: background-color 0.2s ease, transform 0.2s ease;

    &:hover {
      background-color: #4d5cb5;
      transform: translateY(-1px);
    }

    &:active {
      transform: translateY(0);
    }
  }

  .button-icon {
    display: inline-flex;
    margin-right: 0.5rem;
  }

  // 반응형 디자인
  @media (max-width: 640px) {
    padding: 1rem;

    .error-card {
      padding: 2rem;
    }

    .error-title {
      font-size: 1.5rem;
    }
  }
}
</style>
