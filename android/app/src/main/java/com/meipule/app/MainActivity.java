package com.meipule.app;

import android.os.Bundle;
import androidx.activity.EdgeToEdge;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        // 必须在 super.onCreate 之后：BridgeActivity 会先切换到无标题栏主题再创建窗口。
        // 提前调用会用启动页主题生成窗口，导致出现带启动图背景的标题栏。
        super.onCreate(savedInstanceState);
        // 全面屏：内容延伸到状态栏和导航栏下方，安全区由网页里的 --safe-area-inset-* 处理
        EdgeToEdge.enable(this);
    }
}
